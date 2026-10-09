import {db} from '@/lib/db';
import {csrf,staff,failure,HttpError} from '@/lib/security';
import {queuePreparedEmail} from '@/lib/email';
import {prepareOrderTemplate,orderEmailTemplates} from '@/lib/order-email';
import {z} from 'zod';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 csrf(req);const input=z.object({template:z.enum(orderEmailTemplates),version:z.number().int().min(0)}).strict().parse(await req.json());
 const user=await staff(input.template==='ORDER_CONFIRMATION'?'customers':'payments'),{id}=await params;
 const email=await db.$transaction(async tx=>{
  const prepared=await prepareOrderTemplate(tx,id,input.template);
  if(prepared.order.version!==input.version)throw new HttpError(409,'This order changed. Reload it before preparing another email.');
  const changed=await tx.order.updateMany({where:{id,version:input.version},data:{version:{increment:1}}});if(!changed.count)throw new HttpError(409,'This order changed. Reload it.');
  const queued=await queuePreparedEmail(tx,prepared.order.email,input.template,prepared.subject,prepared.content,id);
  await tx.adminAuditLog.create({data:{staffId:user.staff.id,action:'QUEUE_ORDER_DOCUMENT_EMAIL',entityType:'Order',entityId:id,detail:input.template}});
  return {id:queued.id,status:queued.status};
 },{isolationLevel:'Serializable',timeout:30000});
 return Response.json({email,queued:true},{status:201});
}catch(error){return failure(error)}}
