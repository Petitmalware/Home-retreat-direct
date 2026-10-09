import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db.ts';
import {flushEmails,queuePreparedEmail,readEmailContent} from '../lib/email.ts';
import {renderEmailContent} from '../lib/email-content.ts';
import {EmailDeliveryError} from '../lib/email-provider.ts';
import {encrypt} from '../lib/security.ts';

test('production email worker routes business mail and protects uncertain deliveries',{skip:process.env.RUN_INTEGRATION!=='true',timeout:120000},async t=>{
 const keys=['EMAIL_DELIVERY_ENABLED','EMAIL_PROVIDER','APP_ORIGIN','RESEND_API_KEY','EMAIL_FROM','INFO_EMAIL','ORDERS_EMAIL','SUPPORT_EMAIL','EMAIL_INFO_FROM','EMAIL_ORDERS_FROM','EMAIL_SUPPORT_FROM','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_INFO_USER','SMTP_INFO_PASS','SMTP_ORDERS_USER','SMTP_ORDERS_PASS','SMTP_SUPPORT_USER','SMTP_SUPPORT_PASS'];
 const original=Object.fromEntries(keys.map(key=>[key,process.env[key]])),ids=[],suffix=randomUUID();let calls=0;
 const enqueue=async(template,metadata={})=>{const email=await db.$transaction(tx=>queuePreparedEmail(tx,'delivery-'+suffix+'@example.test',template,'TEST ONLY '+template,{...renderEmailContent('TEST ONLY '+template,'An integration test message; no network delivery.',{name:'Home Retreat Direct'}),...metadata}));ids.push(email.id);return email;};
 const status=async id=>(await db.emailLog.findUniqueOrThrow({where:{id}})).status;
 try{
  for(const key of keys)delete process.env[key];Object.assign(process.env,{EMAIL_DELIVERY_ENABLED:'true',EMAIL_PROVIDER:'smtp',APP_ORIGIN:'https://homeretreatdirect.com',SMTP_HOST:'mail.example.test',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'orders@example.test',SMTP_PASS:'private-test-secret',INFO_EMAIL:'info@example.test',ORDERS_EMAIL:'orders@example.test',SUPPORT_EMAIL:'support@example.test'});
  await t.test('every message captures the intended role sender and reply-to',async()=>{
   for(const[template,channel]of [['CONTACT_GENERAL','info'],['INVOICE','orders'],['CANCELLED','support']]){
    const log=await enqueue(template),snapshot=readEmailContent(log.bodyCipher);assert.equal(snapshot.channel,channel);assert.equal(snapshot.replyTo,channel+'@example.test');assert.equal(snapshot.from,'Home Retreat Direct <'+channel+'@example.test>');
    const result=await flushEmails({onlyIds:[log.id],send:async message=>{calls++;assert.equal(message.from,snapshot.from);assert.equal(message.replyTo,snapshot.replyTo);return{id:'MOCK-'+log.id};}});assert.equal(result.processed,1);assert.equal(await status(log.id),'SENT');
   }
   const internal=await enqueue('CONTACT_GENERAL',{channel:'info',replyTo:'submitter@example.test'});assert.equal(readEmailContent(internal.bodyCipher).replyTo,'submitter@example.test');
   await assert.rejects(db.$transaction(tx=>queuePreparedEmail(tx,'recipient@example.test','CONTACT_GENERAL','TEST ONLY',{...renderEmailContent('Test','body',{name:'Store'}),replyTo:'submitter@example.test\r\nBcc: attacker@example.test'})));
  });
  await t.test('SMTP ambiguous results and stale leases require review without another send',async()=>{
   const ambiguous=await enqueue('ORDER_CONFIRMATION');await flushEmails({onlyIds:[ambiguous.id],send:async()=>{calls++;throw new EmailDeliveryError('Uncertain acceptance',true);}});assert.equal(await status(ambiguous.id),'REVIEW_REQUIRED');
   await flushEmails({onlyIds:[ambiguous.id],send:async()=>{throw Error('Ambiguous SMTP messages must not retry');}});
   const stale=await enqueue('INVOICE'),snapshot=readEmailContent(stale.bodyCipher);await db.emailLog.update({where:{id:stale.id},data:{status:'SENDING',attempts:1,claimedAt:new Date(Date.now()-6*60000),bodyCipher:encrypt(JSON.stringify({...snapshot,deliveryProvider:'smtp'}))}});
   await flushEmails({onlyIds:[stale.id],send:async()=>{throw Error('Stale SMTP claims must not retry');}});assert.equal(await status(stale.id),'REVIEW_REQUIRED');
  });
  await t.test('a known SMTP rejection may retry once and accepted mail stays sent',async()=>{
   const log=await enqueue('PAYMENT_RECEIPT');await flushEmails({onlyIds:[log.id],send:async()=>{calls++;throw new EmailDeliveryError('SMTP rejected before accepting',false);}});assert.equal(await status(log.id),'FAILED');
   assert.equal((await flushEmails({onlyIds:[log.id],send:async()=>{calls++;return{id:'MOCK-RETRY'};}})).processed,1);assert.equal(await status(log.id),'SENT');
   await flushEmails({onlyIds:[log.id],send:async()=>{throw Error('Accepted messages must not resend');}});
  });
  await t.test('provider changes after an attempt cannot duplicate a delivery',async()=>{
   const log=await enqueue('INVOICE');await flushEmails({onlyIds:[log.id],send:async()=>{calls++;throw new EmailDeliveryError('known rejection',false);}});process.env.EMAIL_PROVIDER='resend';process.env.RESEND_API_KEY='TEST_ONLY_NO_NETWORK';
   await flushEmails({onlyIds:[log.id],send:async()=>{throw Error('Provider migration requires review');}});assert.equal(await status(log.id),'REVIEW_REQUIRED');
  });
  await t.test('Resend retry uses its original key and stops after the idempotency window',async()=>{
   const log=await enqueue('ORDER_CONFIRMATION'),seen=[];
   await flushEmails({onlyIds:[log.id],send:async(_message,key)=>{calls++;seen.push(key);throw new EmailDeliveryError('network uncertain',true);}});assert.equal(await status(log.id),'SENDING');
   await db.emailLog.update({where:{id:log.id},data:{claimedAt:new Date(Date.now()-6*60000)}});
   await flushEmails({onlyIds:[log.id],send:async(_message,key)=>{calls++;seen.push(key);return{id:'MOCK-RESEND'};}});assert.deepEqual(seen,[log.id,log.id]);
   const expired=await enqueue('INVOICE'),snapshot=readEmailContent(expired.bodyCipher);await db.emailLog.update({where:{id:expired.id},data:{status:'SENDING',attempts:1,claimedAt:new Date(Date.now()-6*60000),bodyCipher:encrypt(JSON.stringify({...snapshot,deliveryProvider:'resend',deliveryStartedAt:new Date(Date.now()-24*3600000).toISOString()}))}});
   await flushEmails({onlyIds:[expired.id],send:async()=>{throw Error('Expired Resend key must not retry');}});assert.equal(await status(expired.id),'REVIEW_REQUIRED');
  });
  await t.test('paused or local configuration does not send messages',async()=>{
   const log=await enqueue('CONTACT_GENERAL'),before=calls;process.env.EMAIL_DELIVERY_ENABLED='false';assert.equal((await flushEmails({onlyIds:[log.id],send:async()=>{calls++;return{id:'MUST-NOT-SEND'};}})).processed,0);assert.equal(await status(log.id),'QUEUED');
   process.env.EMAIL_DELIVERY_ENABLED='true';process.env.APP_ORIGIN='http://localhost:3000';assert.equal((await flushEmails({onlyIds:[log.id],send:async()=>{calls++;return{id:'MUST-NOT-SEND'};}})).processed,0);assert.equal(calls,before);
  });
 }finally{
  await db.emailLog.deleteMany({where:{id:{in:ids}}});for(const[key,value]of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;await db.$disconnect();
 }
});
