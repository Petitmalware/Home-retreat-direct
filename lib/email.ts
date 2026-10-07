import {Resend} from 'resend';
import {db} from './db';
import {encrypt,decrypt} from './security';
import type {Prisma} from '@/generated/prisma/client';
type TX=Prisma.TransactionClient;
export async function queueEmail(tx:TX,to:string,template:string,subject:string,body:string,orderId?:string){return tx.emailLog.create({data:{to,template,subject,bodyCipher:encrypt(body),orderId}})}
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function flushEmails(){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return;
 const stale=new Date(Date.now()-5*60000),day=new Date(Date.now()-23*3600000);
 await db.emailLog.updateMany({where:{status:'SENDING',claimedAt:{lt:day}},data:{status:'REVIEW_REQUIRED',error:'Delivery result is uncertain. Verify with the provider before retrying.'}});
 const logs=await db.emailLog.findMany({where:{attempts:{lt:5},OR:[{status:{in:['QUEUED','FAILED']}},{status:'SENDING',claimedAt:{lt:stale,gte:day}}]},take:10,orderBy:{createdAt:'asc'}});
 for(const log of logs){
  const claimed=await db.emailLog.updateMany({where:{id:log.id,status:log.status,attempts:log.attempts,claimedAt:log.claimedAt},data:{status:'SENDING',claimedAt:new Date(),attempts:{increment:1}}});if(!claimed.count)continue;
  try{
   const body=decrypt(log.bodyCipher),resend=new Resend(process.env.RESEND_API_KEY);
   const {data,error}=await resend.emails.send({from:process.env.EMAIL_FROM,to:log.to,subject:log.subject,text:'HOME RETREAT DIRECT\n\n'+body,html:'<div style="background:#f7f5f0;padding:32px;font-family:Arial,sans-serif;color:#242820"><div style="max-width:600px;margin:auto;background:white;padding:32px;border-top:4px solid #526348"><p style="letter-spacing:3px;font-size:12px">HOME RETREAT DIRECT</p><h1 style="font-family:Georgia,serif;font-size:26px">'+escape(log.subject)+'</h1><div style="white-space:pre-line;line-height:1.7">'+escape(body)+'</div><hr style="border:0;border-top:1px solid #e5e5df;margin:28px 0"/><p style="font-size:12px">Order review before payment. '+escape(process.env.SUPPORT_EMAIL??'')+'</p></div></div>'},{idempotencyKey:log.id});
   if(error||!data?.id)throw new Error(error?.message??'Provider did not return a delivery ID.');
   await db.$transaction(async tx=>{
    const sentAt=new Date();await tx.emailLog.update({where:{id:log.id},data:{status:'SENT',providerId:data.id,sentAt,error:null}});
    if(log.template==='PAYMENT_INSTRUCTIONS'&&log.orderId){
     await tx.payment.updateMany({where:{orderId:log.orderId,status:'REQUESTED',instructionsSentAt:null},data:{instructionsSentAt:sentAt}});
     const order=await tx.order.findUnique({where:{id:log.orderId}});
     if(order?.status==='AWAITING_PAYMENT'){await tx.orderStatusHistory.createMany({data:[{orderId:order.id,status:'PAYMENT_INSTRUCTIONS_SENT',note:'Email provider accepted the payment instruction message.',createdAt:sentAt},{orderId:order.id,status:'AWAITING_PAYMENT',note:'Awaiting independently confirmed receipt of payment.',createdAt:new Date(sentAt.getTime()+1)}]});}
    }
   });
  }catch(e){await db.emailLog.update({where:{id:log.id},data:{status:'FAILED',error:e instanceof Error?e.message:'Delivery failed'}})}
 }
}
export const eventEmail=(status:string,number:string)=>({subject:`${number} · ${status.toLowerCase().replaceAll('_',' ')}`,body:`Your Home Retreat Direct order ${number} is now ${status.toLowerCase().replaceAll('_',' ')}. ${status==='APPROVED'?'Availability and delivery eligibility have been reviewed. Payment has not been received.':status==='PAYMENT_RECEIVED'?'Authorized staff have confirmed receipt of your payment.':status==='DELIVERED'?'Your order has been marked delivered. Thank you for bringing your retreat home.':''}`});
