import {test} from 'node:test';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {createResendDelivery,createSmtpDelivery,EmailDeliveryError,smtpErrorIsUncertain,type EmailDeliveryMessage} from '../lib/email-provider';

const env={SMTP_HOST:'mail.example.test',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'fallback@example.test',SMTP_PASS:'fallback-secret',SMTP_ORDERS_USER:'orders@example.test',SMTP_ORDERS_PASS:'orders-secret'};
const message:EmailDeliveryMessage={from:'Home Retreat Direct <orders@example.test>',to:'customer@example.test',replyTo:'orders@example.test',subject:'Your invoice',text:'Your approved invoice is attached.',html:'<p>Your approved invoice is attached.</p>',attachments:[{filename:'HR-invoice.pdf',content:Buffer.from('%PDF-1.7\nInvoice snapshot'),contentType:'application/pdf'}]};
test('SMTP uses role credentials, encrypted transport, stable IDs, and exact PDF bytes in MIME',async()=>{
 let optionsSeen:unknown,mime='',closed=0;
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix',disableFileAccess:true,disableUrlAccess:true});
 const sender=createSmtpDelivery('orders',env,options=>{optionsSeen=options;return {sendMail:async payload=>{const result=await transport.sendMail(payload);mime=result.message.toString();return{messageId:result.messageId,accepted:[payload.to],rejected:[]};},close:()=>{closed++;}};});
 const result=await sender(message,'email-log-123'),again=await sender(message,'email-log-123');assert.equal(result.id,again.id);assert.equal(closed,2);
 const options=optionsSeen as {requireTLS:boolean;secure:boolean;auth:{user:string;pass:string};tls:{rejectUnauthorized:boolean};disableFileAccess:boolean;disableUrlAccess:boolean;debug:boolean;pool:boolean};
 assert.equal(options.auth.user,'orders@example.test');assert.equal(options.auth.pass,'orders-secret');assert(options.requireTLS);assert(!options.secure);assert(options.tls.rejectUnauthorized);assert(options.disableFileAccess&&options.disableUrlAccess);assert(!options.debug&&!options.pool);
 assert(mime.includes('Reply-To: orders@example.test'));assert(mime.includes('Content-Type: multipart/mixed'));assert(mime.includes('Content-Type: application/pdf'));assert(mime.includes('filename=HR-invoice.pdf'));assert(mime.includes(Buffer.from(message.attachments![0].content).toString('base64')));assert(!mime.includes('orders-secret'));
});
test('SMTP known rejection is retryable; missing final acceptance is uncertain',async()=>{
 assert.equal(smtpErrorIsUncertain({code:'EAUTH',command:'AUTH PLAIN'}),false);assert.equal(smtpErrorIsUncertain({code:'ETIMEDOUT',command:'CONN'}),false);assert.equal(smtpErrorIsUncertain({command:'DATA',responseCode:550}),false);assert.equal(smtpErrorIsUncertain({code:'ECONNECTION',command:'DATA'}),true);assert.equal(smtpErrorIsUncertain({code:'ETIMEDOUT'}),true);
 const failed=createSmtpDelivery('orders',env,()=>({sendMail:async()=>{throw Object.assign(new Error('includes-private-provider-details'),{code:'EAUTH',command:'AUTH LOGIN'});},close:()=>{}}));
 await assert.rejects(failed(message,'rejected'),error=>error instanceof EmailDeliveryError&&!error.uncertain&&!error.message.includes('private-provider-details'));
 const uncertain=createSmtpDelivery('orders',env,()=>({sendMail:async()=>{throw Object.assign(new Error('closed after DATA'),{code:'ECONNECTION',command:'DATA'});},close:()=>{}}));
 await assert.rejects(uncertain(message,'uncertain'),error=>error instanceof EmailDeliveryError&&error.uncertain);
 const missing=createSmtpDelivery('orders',env,()=>({sendMail:async()=>({messageId:'mock',accepted:[],rejected:[]}),close:()=>{}}));
 await assert.rejects(missing(message,'missing'),error=>error instanceof EmailDeliveryError&&error.uncertain);
});
test('Resend preserves the delivery key and treats connection, conflict and server errors as uncertain',async()=>{
 const sender=createResendDelivery({RESEND_API_KEY:'private-test-key'},apiKey=>{assert.equal(apiKey,'private-test-key');return {emails:{send:async(payload,options)=>{assert.equal(options.idempotencyKey,'original-email-log');assert.equal(payload.attachments![0].content,message.attachments![0].content);return{data:{id:'MOCK-RESEND'},error:null};}}};});
 assert.equal((await sender(message,'original-email-log')).id,'MOCK-RESEND');
 for(const statusCode of [null,409,500,503]){const failed=createResendDelivery({},()=>({emails:{send:async()=>({data:null,error:{statusCode}})}}));await assert.rejects(failed(message,'original-key'),error=>error instanceof EmailDeliveryError&&error.uncertain);}
 const rejected=createResendDelivery({},()=>({emails:{send:async()=>({data:null,error:{statusCode:422}})}}));await assert.rejects(rejected(message,'original-key'),error=>error instanceof EmailDeliveryError&&!error.uncertain);
});
