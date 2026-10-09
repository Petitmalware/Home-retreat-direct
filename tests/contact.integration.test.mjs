import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {db} from '../lib/db.ts';
import {readEmailContent} from '../lib/email.ts';
import {businessEmails} from '../lib/business-profile.ts';
import {contactTopics,contactNotificationSubject,readContactSubject} from '../lib/contact-topics.ts';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('contact enquiries route to real business mailboxes and remain private',{skip:process.env.RUN_INTEGRATION!=='true',timeout:90000},async t=>{
 const origin=process.env.APP_ORIGIN??'http://localhost:3000',suffix=randomUUID(),cookies=new Map(),emails=[],ids=[],subjects=new Map();
 const req=async(path,method='GET',body,requestOrigin=origin)=>{const response=await fetch(origin+path,{method,headers:{origin:requestOrigin,cookie:[...cookies].map(([key,value])=>key+'='+value).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const cookie of response.headers.getSetCookie()){const[key,value]=cookie.split(';')[0].split('=');cookies.set(key,value);}return {status:response.status,body:await response.json(),headers:response.headers};};
 const base={name:'Contact TEST',subject:'TEST ONLY product question '+suffix,message:'TEST ONLY. This enquiry is removed immediately after verification. <script>test</script>'};
 try{
  await t.test('CSRF, topic validation and header validation reject unsafe messages without queueing',async()=>{
   const email='contact-invalid-'+suffix+'@example.test',message={...base,email};emails.push(email);
   assert.equal((await req('/api/contact','POST',message,'https://untrusted.example')).status,403);
   for(const invalid of [{message:'short'},{topic:'FINANCE'},{subject:'Question\r\nBcc: victim@example.test'},{name:'Contact\nBcc: victim@example.test'}])assert.equal((await req('/api/contact','POST',{...message,...invalid})).status,400);
   assert.equal(await db.contactMessage.count({where:{email}}),0);
  });
  await t.test('each enquiry type stores its content and queues one appropriate encrypted staff notification',async()=>{
   const contacts=businessEmails(Object.fromEntries((await db.siteSetting.findMany()).map(setting=>[setting.key,setting.value])));
   for(const topic of contactTopics){
    const email='contact-'+topic.value.toLowerCase()+'-'+suffix+'@example.test',message={...base,email,topic:topic.value};emails.push(email);
    assert.equal((await req('/api/contact','POST',message)).status,200);
    const saved=await db.contactMessage.findFirstOrThrow({where:{email}});ids.push(saved.id);subjects.set(saved.id,base.subject);assert.equal(saved.message,message.message);assert.equal(saved.reviewed,false);assert.equal(readContactSubject(saved.subject).topic,topic.value);
    const notifications=await db.emailLog.findMany({where:{subject:contactNotificationSubject(saved)}});assert.equal(notifications.length,1);
    const notification=notifications[0];assert.equal(notification.to,contacts[topic.setting]);assert.equal(notification.template,'STAFF_CONTACT_'+topic.value);assert.equal(notification.status,'QUEUED');assert.equal(notification.sentAt,null);assert(!notification.bodyCipher.includes(email));
    const content=readEmailContent(notification.bodyCipher);assert.equal(content.channel,topic.channel);assert.equal(content.replyTo,email);assert(content.text.includes(message.message));assert(content.text.includes(saved.id));assert(content.html.includes('&lt;script&gt;test&lt;/script&gt;'));assert(!content.html.includes('<script>'));assert.deepEqual(content.attachments,[]);
   }
  });
  await t.test('existing contact clients can omit the new topic field',async()=>{
   const email='contact-legacy-'+suffix+'@example.test';emails.push(email);
   assert.equal((await req('/api/contact','POST',{...base,email})).status,200);
   const saved=await db.contactMessage.findFirstOrThrow({where:{email}});ids.push(saved.id);subjects.set(saved.id,base.subject);assert.equal(readContactSubject(saved.subject).topic,'GENERAL');
   assert.equal((await db.emailLog.findFirstOrThrow({where:{subject:contactNotificationSubject(saved)}})).template,'STAFF_CONTACT_GENERAL');
  });
  await t.test('the maximum valid subject stays intact when its notification header is shortened',async()=>{
   const email='contact-long-'+suffix+'@example.test',subject='TEST ONLY '+suffix+' '+('maximum-length subject ').repeat(10);emails.push(email);
   const message={...base,email,topic:'SUPPLIER_PARTNERSHIP',subject:subject.slice(0,160)};
   assert.equal((await req('/api/contact','POST',message)).status,200);
   const saved=await db.contactMessage.findFirstOrThrow({where:{email}});ids.push(saved.id);subjects.set(saved.id,message.subject);assert.equal(readContactSubject(saved.subject).subject,message.subject);
   const notification=await db.emailLog.findFirstOrThrow({where:{subject:contactNotificationSubject(saved)}});assert(notification.subject.length<=200);assert(readEmailContent(notification.bodyCipher).text.includes(message.subject));
  });
  await t.test('only staff see message content, routing and notification status',async()=>{
   assert.equal((await req('/api/admin/messages')).status,403);
   assert.equal((await req('/api/auth/login','POST',{email:process.env.SEED_OWNER_EMAIL,password:process.env.SEED_OWNER_PASSWORD})).status,200);
   const response=await req('/api/admin/messages');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert(!JSON.stringify(response.body).includes('bodyCipher'));
   for(const id of ids){const item=response.body.messages.find(message=>message.id===id);assert(item);assert.equal(item.subject,subjects.get(id));assert.equal(item.notification.status,'QUEUED');assert.equal(item.reviewed,false);}
   assert.equal((await req('/api/admin/messages','PATCH',{id:ids[0],reviewed:true})).status,200);assert.equal((await db.contactMessage.findUniqueOrThrow({where:{id:ids[0]}})).reviewed,true);
   const settings=await req('/api/admin/settings');assert.equal(settings.status,200);for(const key of ['generalEmail','ordersEmail','supportEmail'])assert(settings.body.settings.find(setting=>setting.key===key)?.value.includes('@'));
   assert.equal((await req('/api/admin/settings','POST',{generalEmail:'not-an-email'})).status,400);
  });
 }finally{
  for(const id of ids){const message=await db.contactMessage.findUnique({where:{id}});if(message){await db.emailLog.deleteMany({where:{subject:contactNotificationSubject(message)}});await db.adminAuditLog.deleteMany({where:{entityId:id}});await db.contactMessage.delete({where:{id}});}}
  await db.contactMessage.deleteMany({where:{email:{in:emails}}});
  await db.rateLimit.deleteMany({where:{key:{in:emails.map(email=>hash('contact:'+email))}}});
  if(cookies.get('hrd_session'))await db.session.deleteMany({where:{tokenHash:hash(cookies.get('hrd_session'))}});
  await db.$disconnect();
 }
});
