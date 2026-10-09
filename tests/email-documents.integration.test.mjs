import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash as passwordHash} from 'bcryptjs';
import {db} from '../lib/db.ts';
import {queueEmail,flushEmails,readEmailContent} from '../lib/email.ts';
import {encrypt} from '../lib/security.ts';

test('order emails prepare real PDF snapshots, enforce payment gates, and wait for configuration',{skip:process.env.RUN_INTEGRATION!=='true',timeout:180000},async t=>{
 const origin=process.env.APP_ORIGIN??'http://localhost:3000',suffix=randomUUID(),number='TEST-EMAIL-'+suffix.slice(0,8),customerEmail='email-'+suffix+'@example.test',ownerCookies=new Map(),supportCookies=new Map();let orderId,addressId,supportId;
 const req=async(path,method='GET',body,cookies=ownerCookies,requestOrigin=origin)=>{const response=await fetch(origin+path,{method,headers:{origin:requestOrigin,cookie:[...cookies].map(([key,value])=>key+'='+value).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const cookie of response.headers.getSetCookie()){const[key,value]=cookie.split(';')[0].split('=');cookies.set(key,value);}const bytes=Buffer.from(await response.arrayBuffer()),json=response.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes):undefined;return{status:response.status,json,bytes};};
 try{
  const variant=await db.productVariant.findFirstOrThrow({where:{product:{status:'ACTIVE',isDemo:false}}});
  const address=await db.address.create({data:{firstName:'Email',lastName:'TEST',line1:'123 Test St',city:'Indianapolis',state:'IN',postalCode:'46204',country:'US'}});addressId=address.id;
  const order=await db.order.create({data:{number,email:customerEmail,phone:'317-555-0100',status:'AWAITING_REVIEW',shippingAddressId:address.id,billingAddressId:address.id,subtotalCents:24900,totalCents:24900,idempotencyKey:randomUUID(),submissionCartId:'TEST-'+suffix,accessTokenHash:suffix,termsAcceptedAt:new Date(),policyVersion:'TEST',isDemo:true,items:{create:{variantId:variant.id,productId:variant.productId,productName:'TEST ONLY accent chair',sku:'TEST',variantName:'Stone',image:'',quantity:1,unitPriceCents:24900}}}});orderId=order.id;
  const endpoint='/api/admin/orders/'+orderId+'/emails';
  await t.test('staff authorization and CSRF protect preview and queues',async()=>{
   assert.equal((await req(endpoint+'/preview?template=ORDER_CONFIRMATION','GET',undefined,new Map())).status,403);
   assert.equal((await req('/api/auth/login','POST',{email:process.env.SEED_OWNER_EMAIL,password:process.env.SEED_OWNER_PASSWORD})).status,200);
   assert.equal((await req(endpoint,'POST',{template:'ORDER_CONFIRMATION',version:0},ownerCookies,'https://untrusted.example')).status,403);
   const support=await db.user.create({data:{name:'Email support TEST',email:'support-'+customerEmail,passwordHash:await passwordHash('Integration-only-password-123',12),staff:{create:{role:'CUSTOMER_SUPPORT'}}}});supportId=support.id;
   assert.equal((await req('/api/auth/login','POST',{email:support.email,password:'Integration-only-password-123'},supportCookies)).status,200);
   assert.equal((await req(endpoint+'/preview?template=INVOICE','GET',undefined,supportCookies)).status,403);
   assert.equal((await req(endpoint+'/preview?template=ORDER_CONFIRMATION','GET',undefined,supportCookies)).status,200);
  });
  await t.test('unpaid confirmation has a PDF and receipts/invoices stay gated',async()=>{
   const preview=await req(endpoint+'/preview?template=ORDER_CONFIRMATION');assert.equal(preview.status,200);assert(preview.json.canQueue);assert.equal(preview.json.to,customerEmail);assert(preview.json.text.includes('$249.00'));assert(!preview.json.text.includes('Payment has been confirmed'));assert(preview.json.attachments[0].filename.endsWith('-confirmation.pdf'));
   const document=await req(preview.json.attachments[0].downloadUrl);assert.equal(document.status,200);assert(document.bytes.subarray(0,4).equals(Buffer.from('%PDF')));
   assert.equal((await req(endpoint+'/preview?template=INVOICE')).json.canQueue,false);assert.equal((await req(endpoint+'/preview?template=PAYMENT_RECEIPT')).json.canQueue,false);
   assert.equal((await req('/api/invoice/'+number+'?kind=RECEIPT')).status,409);assert.equal((await req(endpoint,'POST',{template:'PAYMENT_RECEIPT',version:0})).status,409);
  });
  let firstLog;
  await t.test('queue is encrypted and version guard prevents duplicate submission',async()=>{
   const response=await req(endpoint,'POST',{template:'ORDER_CONFIRMATION',version:0});assert.equal(response.status,201);assert.equal(response.json.email.status,'QUEUED');firstLog=response.json.email.id;
   assert.equal((await req(endpoint,'POST',{template:'ORDER_CONFIRMATION',version:0})).status,409);
   const saved=await db.emailLog.findUniqueOrThrow({where:{id:firstLog}});assert(!saved.bodyCipher.includes(customerEmail));const content=readEmailContent(saved.bodyCipher);assert(content.attachments[0].content.startsWith('JVBER'));assert.equal(saved.sentAt,null);
  });
  await t.test('invoice records confirmed charges and receipt requires real confirmed amount',async()=>{
   await db.order.update({where:{id:orderId},data:{status:'APPROVED',shippingCents:3000,taxCents:1953,totalCents:29853,shippingConfirmed:true,taxConfirmed:true}});
   const preview=await req(endpoint+'/preview?template=INVOICE');assert.equal(preview.json.canQueue,true);assert(preview.json.text.includes('$298.53'));assert(preview.json.text.includes('Payment has not been confirmed'));
   assert.equal((await req(endpoint,'POST',{template:'INVOICE',version:1})).status,201);
   assert.equal((await req(endpoint+'/preview?template=PAYMENT_RECEIPT')).json.canQueue,false);
   await db.payment.create({data:{orderId,status:'CONFIRMED',amountRequestedCents:29853,amountReceivedCents:29853,receivedAt:new Date(),reference:'TEST ONLY no funds'}});await db.order.update({where:{id:orderId},data:{status:'PAYMENT_RECEIVED'}});
   const receipt=await req(endpoint+'/preview?template=PAYMENT_RECEIPT');assert(receipt.json.canQueue);assert(receipt.json.text.includes('Payment for order'));assert(receipt.json.attachments[0].filename.endsWith('-receipt.pdf'));
   assert.equal((await req(endpoint,'POST',{template:'PAYMENT_RECEIPT',version:2})).status,201);
  });
  await t.test('automatic notifications include confirmation, invoice and receipt documents',async()=>{
   for(const template of ['ORDER_RECEIVED','APPROVED','PAYMENT_RECEIVED']){const log=await db.$transaction(tx=>queueEmail(tx,customerEmail,template,'TEST automatic '+template,'TEST ONLY automatic notification',orderId),{timeout:30000});assert.equal(readEmailContent(log.bodyCipher).attachments.length,1);}
  });
  await t.test('unconfigured worker sends nothing; mocked provider receives exact PDF bytes and HTML',async()=>{
   const original={};for(const key of ['EMAIL_DELIVERY_ENABLED','EMAIL_PROVIDER','RESEND_API_KEY','EMAIL_FROM','APP_ORIGIN','SUPPORT_EMAIL'])original[key]=process.env[key];let delivered=0;
   try{
    process.env.EMAIL_DELIVERY_ENABLED='false';const paused=await flushEmails({onlyIds:[firstLog],send:async()=>{delivered++;return{id:'TEST'}}});assert.equal(paused.processed,0);assert.equal(delivered,0);
    process.env.EMAIL_DELIVERY_ENABLED='true';process.env.EMAIL_PROVIDER='resend';process.env.RESEND_API_KEY='TEST_ONLY_NO_NETWORK';process.env.EMAIL_FROM='Home Retreat Direct <orders@example.test>';process.env.APP_ORIGIN='https://shop.example.test';process.env.SUPPORT_EMAIL='support@example.test';
    const saved=await db.emailLog.findUniqueOrThrow({where:{id:firstLog}}),snapshot=readEmailContent(saved.bodyCipher);
    const result=await flushEmails({onlyIds:[firstLog],send:async(message,key)=>{delivered++;assert.equal(key,firstLog);assert.equal(message.to,customerEmail);assert.equal(message.replyTo,snapshot.replyTo);assert.equal(snapshot.channel,'orders');assert(message.html.includes('https://shop.example.test'));assert(message.attachments[0].content.equals(Buffer.from(snapshot.attachments[0].content,'base64')));return{id:'MOCK-'+suffix};}});
    assert.equal(result.processed,1);assert.equal(delivered,1);const sent=await db.emailLog.findUniqueOrThrow({where:{id:firstLog}});assert.equal(sent.status,'SENT');assert(sent.sentAt);
    await flushEmails({onlyIds:[firstLog],send:async()=>{throw Error('Already-sent message must not retry');}});
   }finally{for(const[key,value]of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  await t.test('resend preserves saved document and rejects queued/ambiguous deliveries',async()=>{
   const retry=await req(endpoint+'/'+firstLog,'POST',{version:3});assert.equal(retry.status,201);const copied=await db.emailLog.findUniqueOrThrow({where:{id:retry.json.email.id}}),original=await db.emailLog.findUniqueOrThrow({where:{id:firstLog}}),snapshot=readEmailContent(original.bodyCipher);delete snapshot.deliveryProvider;delete snapshot.deliveryStartedAt;assert.deepEqual(readEmailContent(copied.bodyCipher),snapshot);assert.equal((await req(endpoint+'/'+copied.id,'POST',{version:4})).status,409);
  });
  await t.test('legacy encrypted plain-text email remains readable',async()=>{const content=readEmailContent(encrypt('Legacy order update'));assert(content.text.includes('Legacy order update'));assert(content.html.includes('Legacy order update'));assert.equal(content.attachments.length,0);});
 }finally{
  if(orderId){await db.emailLog.deleteMany({where:{orderId}});await db.adminAuditLog.deleteMany({where:{entityId:orderId}});await db.payment.deleteMany({where:{orderId}});await db.orderItem.deleteMany({where:{orderId}});await db.order.delete({where:{id:orderId}});}if(addressId)await db.address.delete({where:{id:addressId}});if(supportId)await db.user.delete({where:{id:supportId}});await db.$disconnect();
 }
});
