import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessEmailAddress,emailChannelForTemplate,emailConfiguration,emailFrom,headerMailbox,publicEmailOrigin,smtpCredentials,type EmailEnvironment} from '../lib/email-routing';

const base:EmailEnvironment={EMAIL_DELIVERY_ENABLED:'true',APP_ORIGIN:'https://homeretreatdirect.com',EMAIL_PROVIDER:'smtp',SMTP_HOST:'mail.example.test',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'orders@homeretreatdirect.com',SMTP_PASS:'private-test-password'};
test('business email roles use the matching sender and reply mailbox',()=>{
 for(const template of ['ORDER_RECEIVED','ORDER_CONFIRMATION','INVOICE','PAYMENT_RECEIPT','PAYMENT_INSTRUCTIONS','APPROVED','SHIPPED','ORDER_STAFF_ALERT'])assert.equal(emailChannelForTemplate(template),'orders');
 for(const template of ['CANCELLED','REFUND_PENDING','REFUNDED','REVIEW_REQUEST','STAFF_MESSAGE','CONTACT_SUPPORT'])assert.equal(emailChannelForTemplate(template),'support');
 for(const template of ['CONTACT_GENERAL','SUPPLIER_ENQUIRY','PARTNERSHIP','BUSINESS_COMMUNICATION','NEWSLETTER'])assert.equal(emailChannelForTemplate(template),'info');
 assert.equal(businessEmailAddress('orders',{}),'orders@homeretreatdirect.com');assert.equal(emailFrom('support',{}),'Home Retreat Direct <support@homeretreatdirect.com>');
 assert.equal(emailFrom('orders',{EMAIL_FROM:'Owner <custom@example.test>'}),'Owner <custom@example.test>');
 assert.throws(()=>businessEmailAddress('info',{INFO_EMAIL:'owner@example.test\r\nBcc: attacker@example.test'}));
 for(const invalid of ['A <one@example.test>,two@example.test','A, B <one@example.test>','one@example.test\nBcc:two@example.test','A <one@example.test','one@example.test>'])assert.throws(()=>headerMailbox(invalid));
});
test('SMTP readiness requires secure connection and the configured credentials for each mailbox',()=>{
 const ready=emailConfiguration(undefined,base);assert(ready.configured);assert.equal(ready.provider,'smtp');assert.equal(ready.channels.info.replyTo,'info@homeretreatdirect.com');assert(!JSON.stringify(ready).includes('private-test-password'));
 const override={...base,SMTP_SUPPORT_USER:'support@homeretreatdirect.com',SMTP_SUPPORT_PASS:'support-secret'};assert.equal(smtpCredentials('support',override).user,'support@homeretreatdirect.com');assert.equal(smtpCredentials('orders',override).user,'orders@homeretreatdirect.com');
 const incomplete=emailConfiguration(undefined,{...base,SMTP_SUPPORT_USER:'support@homeretreatdirect.com'});assert(!incomplete.configured);assert(incomplete.channels.orders.configured);assert(incomplete.channels.support.missing.includes('SMTP_SUPPORT_PASS'));
 assert(!emailConfiguration(undefined,{...base,SMTP_PORT:'465',SMTP_SECURE:'false'}).configured);assert(!emailConfiguration(undefined,{...base,SMTP_PORT:'587',SMTP_SECURE:'true'}).configured);assert(emailConfiguration(undefined,{...base,SMTP_PORT:'587',SMTP_SECURE:'false'}).configured);
 assert(!emailConfiguration(undefined,{...base,SMTP_HOST:'smtp://unsafe.example'}).configured);assert(!emailConfiguration(undefined,{...base,EMAIL_DELIVERY_ENABLED:'false'}).configured);
});
test('Resend readiness stays backward compatible and delivery rejects local or malformed origins',()=>{
 const env={...base,EMAIL_PROVIDER:'resend',RESEND_API_KEY:'private-api-test-key'};assert(emailConfiguration(undefined,env).configured);assert(!emailConfiguration(undefined,{...env,RESEND_API_KEY:undefined}).configured);assert(!emailConfiguration(undefined,{...env,EMAIL_PROVIDER:'unknown'}).configured);
 for(const origin of ['http://homeretreatdirect.com','https://localhost','https://127.0.0.2','https://10.0.0.1','https://192.168.1.1','https://[::1]','https://host.local','https://user:password@homeretreatdirect.com','https://homeretreatdirect.com/private'])assert(!publicEmailOrigin(origin),origin);
 assert(publicEmailOrigin('https://homeretreatdirect.com'));assert(publicEmailOrigin('https://www.homeretreatdirect.com/'));
});
