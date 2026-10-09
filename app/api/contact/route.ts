import {z} from 'zod';
import {db} from '@/lib/db';
import {csrf,limit,failure} from '@/lib/security';
import {email} from '@/lib/validation';
import {contactTopic,storedContactSubject,contactNotificationSubject} from '@/lib/contact-topics';
import {queuePreparedEmail} from '@/lib/email';
import {renderEmailContent} from '@/lib/email-content';
import {businessEmailAddress} from '@/lib/email-routing';
export async function POST(req:Request){try{
 csrf(req);const d=z.object({name:z.string().trim().min(2).max(120).refine(value=>!/[\x00-\x1f\x7f]/.test(value)),email,topic:z.enum(['GENERAL','SUPPLIER_PARTNERSHIP','ORDER','SUPPORT']).default('GENERAL'),subject:z.string().trim().min(3).max(160).refine(value=>!/[\x00-\x1f\x7f]/.test(value)),message:z.string().trim().min(20).max(5000)}).parse(await req.json());
 await limit('contact',d.email,3);
 const topic=contactTopic(d.topic);
 await db.$transaction(async tx=>{
  const settings=await tx.siteSetting.findMany({where:{key:{in:['storeName',topic.setting]}}}),value=(key:string)=>settings.find(setting=>setting.key===key)?.value;
  const destination=email.parse(value(topic.setting)||businessEmailAddress(topic.channel));
  const message=await tx.contactMessage.create({data:{name:d.name,email:d.email,subject:storedContactSubject(d.topic,d.subject),message:d.message}});
  const subject=contactNotificationSubject(message),body=`A ${topic.label.toLowerCase()} has been submitted.\n\nReference: ${message.id}\nFrom: ${d.name} <${d.email}>\nSubject: ${d.subject}\n\n${d.message}\n\nReview this message in the staff inbox: ${process.env.APP_ORIGIN}/admin/messages`;
  await queuePreparedEmail(tx,destination,'STAFF_CONTACT_'+d.topic,subject,{...renderEmailContent(subject,body,{name:value('storeName')||'Home Retreat Direct',supportEmail:destination}),channel:topic.channel,replyTo:d.email});
 },{timeout:30000});
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
