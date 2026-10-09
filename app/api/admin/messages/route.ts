import {z} from 'zod';
import {db} from '@/lib/db';
import {staff,csrf,failure} from '@/lib/security';
import {readContactSubject,contactNotificationSubject} from '@/lib/contact-topics';
export async function GET(){try{
 await staff('customers');
 const messages=await db.contactMessage.findMany({take:100,orderBy:[{reviewed:'asc'},{createdAt:'desc'}]});
 const notifications=await db.emailLog.findMany({where:{template:{startsWith:'STAFF_CONTACT_'},subject:{in:messages.map(contactNotificationSubject)}},select:{subject:true,to:true,status:true,sentAt:true},orderBy:{createdAt:'desc'}});
 return Response.json({messages:messages.map(message=>({...message,...readContactSubject(message.subject),notification:notifications.find(notification=>notification.subject===contactNotificationSubject(message))??null}))},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e)}}
export async function PATCH(req:Request){try{csrf(req);const u=await staff('customers'),d=z.object({id:z.string(),reviewed:z.boolean()}).parse(await req.json());await db.$transaction(async tx=>{await tx.contactMessage.update({where:{id:d.id},data:{reviewed:d.reviewed}});await tx.adminAuditLog.create({data:{staffId:u.staff.id,action:d.reviewed?'REVIEW_CONTACT_MESSAGE':'REOPEN_CONTACT_MESSAGE',entityType:'ContactMessage',entityId:d.id}});});return Response.json({ok:true});}catch(e){return failure(e)}}
