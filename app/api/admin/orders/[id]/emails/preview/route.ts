import {db} from '@/lib/db';
import {staff,failure} from '@/lib/security';
import {emailConfiguration} from '@/lib/email';
import {prepareOrderTemplate,orderEmailTemplates} from '@/lib/order-email';
import {z} from 'zod';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const template=z.enum(orderEmailTemplates).parse(new URL(req.url).searchParams.get('template'));
 await staff(template==='ORDER_CONFIRMATION'?'customers':'payments');
 const{id}=await params;
 try{
  const prepared=await db.$transaction(tx=>prepareOrderTemplate(tx,id,template),{timeout:30000});
  const kind=template==='INVOICE'?'INVOICE':template==='PAYMENT_RECEIPT'?'RECEIPT':'ORDER_CONFIRMATION';
  return Response.json({to:prepared.order.email,subject:prepared.subject,text:prepared.content.text,html:prepared.content.html,attachments:prepared.content.attachments.map(file=>({filename:file.filename,contentType:file.contentType,downloadUrl:`/api/invoice/${prepared.order.number}?kind=${kind}`})),canQueue:true,emailConfigured:emailConfiguration().configured},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if(error instanceof Error&&'status'in error&&error.status===409)return Response.json({to:'',subject:'',text:'',html:'',attachments:[],canQueue:false,reason:error.message,emailConfigured:emailConfiguration().configured},{headers:{'Cache-Control':'private, no-store'}});
  throw error;
 }
}catch(error){return failure(error)}}
