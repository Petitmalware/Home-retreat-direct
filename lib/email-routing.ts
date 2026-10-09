import {isIP} from 'node:net';
import {z} from 'zod';
import {businessProfile} from './business-profile';

export const emailChannels=['info','orders','support'] as const;
export type EmailChannel=typeof emailChannels[number];
export type EmailProvider='resend'|'smtp';
export type EmailEnvironment=Record<string,string|undefined>;
export const mailboxSchema=z.string().trim().max(254).email().refine(value=>!/[\r\n,;<>\s]/.test(value),'Use one email address.');

const defaultAddresses:Record<EmailChannel,string>=businessProfile.emails;
export function businessEmailAddress(channel:EmailChannel,env:EmailEnvironment=process.env){return mailboxSchema.parse(env[channel.toUpperCase()+'_EMAIL']||defaultAddresses[channel]);}
export function emailChannelForTemplate(template:string):EmailChannel{
 if(/CANCEL|REFUND|REJECT|REVIEW_REQUEST|SUPPORT|STAFF_MESSAGE|CUSTOMER_REPLY|DELIVERY_ISSUE/.test(template))return 'support';
 if(/CONTACT|ENQUIR|INQUIR|SUPPLIER|PARTNERSHIP|BUSINESS|NEWSLETTER/.test(template))return 'info';
 return 'orders';
}
export function headerMailbox(value:string){
 if(/[\r\n\x00-\x1f\x7f]/.test(value)||value.length>400)throw new Error('Use a valid single sender mailbox.');
 const direct=mailboxSchema.safeParse(value);if(direct.success)return direct.data;
 const named=value.match(/^[^<>,;]+<([^<>]+)>$/);if(!named)throw new Error('Use a valid single sender mailbox.');
 return mailboxSchema.parse(named[1]);
}
export function emailFrom(channel:EmailChannel,env:EmailEnvironment=process.env){
 const value=env['EMAIL_'+channel.toUpperCase()+'_FROM']||(channel==='orders'?env.EMAIL_FROM:undefined)||`Home Retreat Direct <${businessEmailAddress(channel,env)}>`;
 headerMailbox(value);return value;
}
export function publicEmailOrigin(value:string|undefined){
 try{
  const url=new URL(value??''),host=url.hostname.toLowerCase(),ip=host.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return false;
  if(isIP(ip)===4){const parts=ip.split('.').map(Number);if([0,10,127].includes(parts[0])||parts[0]===169&&parts[1]===254||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168)return false;}
  if(isIP(ip)===6&&(ip==='::'||/^(?:0*:)*0*1$/.test(ip)||/^f[cd]|^fe[89ab]|^::ffff:/i.test(ip)))return false;
  if(!host.includes('.')&&!isIP(ip))return false;
  return !!host;
 }catch{return false;}
}
export function smtpCredentials(channel:EmailChannel,env:EmailEnvironment=process.env){
 const prefix='SMTP_'+channel.toUpperCase(),specific=env[prefix+'_USER']!==undefined&&env[prefix+'_USER']!==''||env[prefix+'_PASS']!==undefined&&env[prefix+'_PASS']!=='';
 return {user:specific?env[prefix+'_USER']:env.SMTP_USER,pass:specific?env[prefix+'_PASS']:env.SMTP_PASS,prefix:specific?prefix:'SMTP'};
}
export function smtpConnection(env:EmailEnvironment=process.env){
 const port=Number(env.SMTP_PORT||587),secure=env.SMTP_SECURE===undefined||env.SMTP_SECURE===''?port===465:env.SMTP_SECURE==='true';
 return {host:env.SMTP_HOST??'',port,secure,servername:env.SMTP_TLS_SERVERNAME||undefined};
}
export function emailConfiguration(channel?:EmailChannel,env:EmailEnvironment=process.env){
 const provider:EmailProvider=env.EMAIL_PROVIDER==='smtp'?'smtp':'resend',common:string[]=[];
 if(env.EMAIL_PROVIDER&&env.EMAIL_PROVIDER!=='smtp'&&env.EMAIL_PROVIDER!=='resend')common.push('EMAIL_PROVIDER must be smtp or resend');
 if(env.EMAIL_DELIVERY_ENABLED!=='true')common.push('EMAIL_DELIVERY_ENABLED');
 if(!publicEmailOrigin(env.APP_ORIGIN))common.push('Public HTTPS APP_ORIGIN');
 if(provider==='resend'&&!env.RESEND_API_KEY)common.push('RESEND_API_KEY');
 if(provider==='smtp'){
  const connection=smtpConnection(env);
  if(!connection.host||!/^[a-zA-Z0-9.:-]+$/.test(connection.host))common.push('SMTP_HOST');
  if(![465,587].includes(connection.port))common.push('SMTP_PORT must be 465 or 587');
  if(env.SMTP_SECURE&&env.SMTP_SECURE!=='true'&&env.SMTP_SECURE!=='false'||connection.port===465&&!connection.secure||connection.port===587&&connection.secure)common.push('SMTP_SECURE must match the port');
  if(connection.servername&&!/^[a-zA-Z0-9.-]+$/.test(connection.servername))common.push('SMTP_TLS_SERVERNAME');
 }
 const channels=Object.fromEntries(emailChannels.map(item=>{
  const missing=[...common];let from='',replyTo='';
  try{from=emailFrom(item,env);}catch{missing.push('EMAIL_'+item.toUpperCase()+'_FROM');}
  try{replyTo=businessEmailAddress(item,env);}catch{missing.push(item.toUpperCase()+'_EMAIL');}
  if(provider==='smtp'){const auth=smtpCredentials(item,env);if(!auth.user||/[\r\n]/.test(auth.user))missing.push(auth.prefix+'_USER');if(!auth.pass)missing.push(auth.prefix+'_PASS');}
  return [item,{configured:missing.length===0,from,replyTo,missing}];
 })) as Record<EmailChannel,{configured:boolean;from:string;replyTo:string;missing:string[]}>;
 const missing=[...new Set((channel?[channels[channel]]:Object.values(channels)).flatMap(item=>item.missing))];
 return {configured:missing.length===0,provider,sendingEnabled:env.EMAIL_DELIVERY_ENABLED==='true',missing,channels};
}
