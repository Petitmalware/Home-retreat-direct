import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {Resend} from 'resend';
import {headerMailbox,smtpConnection,smtpCredentials,type EmailChannel,type EmailEnvironment,type EmailProvider} from './email-routing';

export type EmailDeliveryMessage={from:string;to:string;subject:string;text:string;html:string;replyTo?:string;attachments?:{filename:string;content:Buffer;contentType:string}[]};
export type EmailDelivery=(message:EmailDeliveryMessage,idempotencyKey:string)=>Promise<{id:string}>;
export class EmailDeliveryError extends Error{constructor(message:string,public uncertain:boolean){super(message);this.name='EmailDeliveryError';}}
export function smtpErrorIsUncertain(error:unknown){
 const issue=(error&&typeof error==='object'?error:{}) as {code?:string;command?:string;responseCode?:number};
 if(issue.responseCode&&issue.responseCode>=400&&issue.responseCode<600)return false;
 if(issue.command&&/^(?:CONN|EHLO|HELO|STARTTLS|AUTH(?:\s|$)|MAIL FROM|RCPT TO)/i.test(issue.command))return false;
 if(['EDNS','EAUTH','ENOAUTH','EOAUTH2','ECONFIG','EENVELOPE','EMAXRECIPIENTS','EFILEACCESS','EURLACCESS'].includes(issue.code??''))return false;
 return true;
}
type SmtpFactory=(options:SMTPTransport.Options)=>{sendMail:(message:EmailDeliveryMessage&{messageId:string})=>Promise<{messageId:string;accepted?:unknown[];rejected?:unknown[]}>;close:()=>void};
export function createSmtpDelivery(channel:EmailChannel,env:EmailEnvironment=process.env,factory:SmtpFactory=options=>nodemailer.createTransport(options)):EmailDelivery{
 return async(message,key)=>{
  const connection=smtpConnection(env),auth=smtpCredentials(channel,env),domain=headerMailbox(message.from).split('@')[1],messageId=`<hrd-${createHash('sha256').update(key).digest('hex')}@${domain}>`;
  const transport=factory({...connection,auth:{user:auth.user!,pass:auth.pass!},pool:false,requireTLS:!connection.secure,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,...(connection.servername?{servername:connection.servername}:{})},connectionTimeout:15000,greetingTimeout:10000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
  try{
   const result=await transport.sendMail({...message,messageId}),accepted=(result.accepted??[]).map(item=>String(item).toLowerCase());
   if(!accepted.includes(message.to.toLowerCase()))throw new EmailDeliveryError('SMTP did not confirm acceptance for this recipient.',!(result.rejected?.length));
   if(!result.messageId)throw new EmailDeliveryError('SMTP accepted the message but returned no message ID. Verify delivery before retrying.',true);
   return {id:result.messageId};
  }catch(error){if(error instanceof EmailDeliveryError)throw error;throw new EmailDeliveryError(smtpErrorIsUncertain(error)?'SMTP delivery result is uncertain. Check the mailbox provider before retrying.':'SMTP rejected the message before accepting it. Check the sender, recipient and server configuration.',smtpErrorIsUncertain(error));}
  finally{transport.close();}
 };
}
type ResendFactory=(apiKey:string|undefined)=>{emails:{send:(message:EmailDeliveryMessage,options:{idempotencyKey:string})=>Promise<{data:{id:string}|null;error:{statusCode?:number|null}|null}>}};
export function createResendDelivery(env:EmailEnvironment=process.env,factory:ResendFactory=apiKey=>new Resend(apiKey)):EmailDelivery{return async(message,idempotencyKey)=>{
 try{const {data,error}=await factory(env.RESEND_API_KEY).emails.send(message,{idempotencyKey});if(error||!data?.id){const uncertain=!error||!error.statusCode||error.statusCode>=500||error.statusCode===409;throw new EmailDeliveryError(uncertain?'The email provider returned an uncertain delivery result. The same idempotency key must be retained.':'The email provider did not accept the message. Check its delivery log and sender configuration.',uncertain);}return data;}
 catch(error){if(error instanceof EmailDeliveryError)throw error;throw new EmailDeliveryError('The email provider connection failed. Delivery will retry with the same idempotency key.',true);}
};}
export function providerDelivery(provider:EmailProvider,channel:EmailChannel,env:EmailEnvironment=process.env){return provider==='smtp'?createSmtpDelivery(channel,env):createResendDelivery(env);}
