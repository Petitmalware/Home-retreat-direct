import {db} from '@/lib/db';
import {csrf,staff,failure,HttpError} from '@/lib/security';
import {readEmailContent,queuePreparedEmail} from '@/lib/email';
import {emailDocumentKind} from '@/lib/order-email';
import {z} from 'zod';
export async function POST(req:Request,{params}:{params:Promise<{id:string;emailId:string}>}){try{
 csrf(req);const{version}=z.object({version:z.number().int().min(0)}).strict().parse(await req.json());const{id,emailId}=await params;
 await staff('customers');
 const original=await db.emailLog.findFirst({where:{id:emailId,orderId:id}});if(!original)throw new HttpError(404,'Email not found.');
 const kind=emailDocumentKind(original.template),user=await staff(kind==='INVOICE'||kind==='RECEIPT'||original.template==='PAYMENT_INSTRUCTIONS'?'payments':'customers');
 const email=await db.$transaction(async tx=>{
  const order=await tx.order.findUniqueOrThrow({where:{id}}),saved=await tx.emailLog.findFirst({where:{id:emailId,orderId:id}});
  if(!saved||!['SENT','FAILED'].includes(saved.status))throw new HttpError(409,'Only sent or failed emails can be queued again. Check uncertain deliveries with the provider first.');
  if(order.email!==saved.to)throw new HttpError(409,'The saved recipient no longer matches this order. Prepare a new email instead.');
  const changed=await tx.order.updateMany({where:{id,version},data:{version:{increment:1}}});if(!changed.count)throw new HttpError(409,'This order changed. Reload it.');
  const queued=await queuePreparedEmail(tx,saved.to,saved.template,saved.subject,readEmailContent(saved.bodyCipher),id);
  await tx.adminAuditLog.create({data:{staffId:user.staff.id,action:'REQUEUE_ORDER_EMAIL',entityType:'Order',entityId:id,detail:saved.id}});
  return {id:queued.id,status:queued.status};
 },{isolationLevel:'Serializable',timeout:30000});
 return Response.json({email,queued:true},{status:201});
}catch(error){return failure(error)}}
