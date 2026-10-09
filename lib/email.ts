import {z} from 'zod';
import {db} from './db';
import {encrypt,decrypt} from './security';
import {prepareOrderEmail} from './order-email';
import {renderEmailContent,type PreparedEmail} from './email-content';
import {businessEmailAddress,emailChannelForTemplate,emailConfiguration,emailFrom,headerMailbox,mailboxSchema,type EmailChannel} from './email-routing';
import {EmailDeliveryError,providerDelivery,type EmailDelivery} from './email-provider';
import type {Prisma} from '@/generated/prisma/client';
export {emailConfiguration} from './email-routing';
export type {EmailDeliveryMessage} from './email-provider';
type TX=Prisma.TransactionClient;
const payloadSchema=z.object({version:z.literal(1),text:z.string().max(200000),html:z.string().max(500000),origin:z.string().url().optional(),channel:z.enum(['info','orders','support']).optional(),from:z.string().refine(value=>{try{headerMailbox(value);return true;}catch{return false;}}).optional(),replyTo:mailboxSchema.optional(),deliveryProvider:z.enum(['resend','smtp']).optional(),deliveryStartedAt:z.string().datetime().optional(),attachments:z.array(z.object({filename:z.string().regex(/^[a-zA-Z0-9_.-]+\.pdf$/).max(150),contentType:z.literal('application/pdf'),content:z.string().max(14000000).regex(/^[A-Za-z0-9+/]*={0,2}$/)})).max(3)});
export function readEmailContent(cipher:string):PreparedEmail{
 const plain=decrypt(cipher);let parsed:unknown;try{parsed=JSON.parse(plain)}catch{}
 if(parsed&&typeof parsed==='object'&&'version'in parsed)return payloadSchema.parse(parsed);
 return renderEmailContent('Order update',plain,{name:'Home Retreat Direct',supportEmail:process.env.SUPPORT_EMAIL});
}
export async function queuePreparedEmail(tx:TX,to:string,template:string,subject:string,content:PreparedEmail,orderId?:string){
 const recipient=mailboxSchema.parse(to),title=z.string().min(1).max(200).refine(value=>!/[\r\n\x00-\x1f\x7f]/.test(value)).parse(subject),channel=content.channel??emailChannelForTemplate(template);
 const payload=payloadSchema.parse({...content,deliveryProvider:undefined,deliveryStartedAt:undefined,channel,from:content.from??emailFrom(channel),replyTo:content.replyTo??businessEmailAddress(channel)});
 return tx.emailLog.create({data:{to:recipient,template,subject:title,bodyCipher:encrypt(JSON.stringify(payload)),orderId}});
}
export async function queueEmail(tx:TX,to:string,template:string,subject:string,body:string,orderId?:string){return queuePreparedEmail(tx,to,template,subject,await prepareOrderEmail(tx,to,template,subject,body,orderId),orderId)}
export async function flushEmails(options:{send?:EmailDelivery;onlyIds?:string[]}={}){
 const configuration=emailConfiguration();if(!Object.values(configuration.channels).some(channel=>channel.configured))return {processed:0,configured:false};
 const scope=options.onlyIds?{id:{in:options.onlyIds}}:{},stale=new Date(Date.now()-5*60000),day=new Date(Date.now()-23*3600000);
 await db.emailLog.updateMany({where:{...scope,status:'SENDING',OR:[{claimedAt:{lt:day}},{claimedAt:null}]},data:{status:'REVIEW_REQUIRED',error:'Delivery result is uncertain. Verify with the provider before retrying.'}});
 const logs=await db.emailLog.findMany({where:{...scope,attempts:{lt:5},OR:[{status:{in:['QUEUED','FAILED']}},{status:'SENDING',claimedAt:{lt:stale,gte:day}}]},take:10,orderBy:{createdAt:'asc'}});let processed=0;
 for(const log of logs){
  let content:PreparedEmail,channel:EmailChannel;
  try{content=readEmailContent(log.bodyCipher);channel=content.channel??emailChannelForTemplate(log.template);mailboxSchema.parse(log.to);z.string().refine(value=>!/[\r\n\x00-\x1f\x7f]/.test(value)).parse(log.subject);}
  catch{await db.emailLog.updateMany({where:{id:log.id,status:log.status,attempts:log.attempts},data:{status:'REVIEW_REQUIRED',error:'Saved email content could not be validated. Review the message before sending.'}});continue;}
  if(!configuration.channels[channel].configured)continue;
  const priorProvider=content.deliveryProvider??(log.attempts>0?'resend':undefined);
  const startedAt=content.deliveryStartedAt??(log.attempts>0?log.createdAt.toISOString():new Date().toISOString());
  if(priorProvider&&priorProvider!==configuration.provider||log.status==='SENDING'&&configuration.provider==='smtp'||priorProvider==='resend'&&new Date(startedAt)<day){
   await db.emailLog.updateMany({where:{id:log.id,status:log.status,attempts:log.attempts,claimedAt:log.claimedAt},data:{status:'REVIEW_REQUIRED',error:'A previous delivery attempt has an uncertain result. Verify with the original provider before retrying.'}});continue;
  }
  const prepared=payloadSchema.parse({...content,channel,from:content.from??configuration.channels[channel].from,replyTo:content.replyTo??configuration.channels[channel].replyTo,deliveryProvider:configuration.provider,deliveryStartedAt:startedAt});
  const claimed=await db.emailLog.updateMany({where:{id:log.id,status:log.status,attempts:log.attempts,claimedAt:log.claimedAt},data:{status:'SENDING',claimedAt:new Date(),attempts:{increment:1},bodyCipher:encrypt(JSON.stringify(prepared))}});if(!claimed.count)continue;
  let accepted=false;
  try{
   const origin=process.env.APP_ORIGIN!,rebase=(value:string)=>prepared.origin&&prepared.origin!==origin?value.split(prepared.origin).join(origin):value;
   const result=await (options.send??providerDelivery(configuration.provider,channel))({from:prepared.from!,to:log.to,subject:log.subject,text:rebase(prepared.text),html:rebase(prepared.html),replyTo:prepared.replyTo,...(prepared.attachments.length?{attachments:prepared.attachments.map(attachment=>({...attachment,content:Buffer.from(attachment.content,'base64')}))}:{})},log.id);
   if(!result?.id)throw new EmailDeliveryError('The delivery result did not include an acceptance ID. Verify with the provider before retrying.',true);accepted=true;
   await db.$transaction(async tx=>{
    const sentAt=new Date();await tx.emailLog.update({where:{id:log.id},data:{status:'SENT',providerId:result.id,sentAt,error:null}});
    if(log.template==='PAYMENT_INSTRUCTIONS'&&log.orderId){
     await tx.payment.updateMany({where:{orderId:log.orderId,status:'REQUESTED',instructionsSentAt:null},data:{instructionsSentAt:sentAt}});
     const order=await tx.order.findUnique({where:{id:log.orderId}});
     if(order?.status==='AWAITING_PAYMENT'){await tx.orderStatusHistory.createMany({data:[{orderId:order.id,status:'PAYMENT_INSTRUCTIONS_SENT',note:'Email provider accepted the payment instruction message.',createdAt:sentAt},{orderId:order.id,status:'AWAITING_PAYMENT',note:'Awaiting independently confirmed receipt of payment.',createdAt:new Date(sentAt.getTime()+1)}]});}
    }
   });processed++;
  }catch(error){
   const uncertain=!(error instanceof EmailDeliveryError)||error.uncertain,review=accepted||configuration.provider==='smtp'&&uncertain,status=review?'REVIEW_REQUIRED':uncertain?'SENDING':'FAILED';
   await db.emailLog.updateMany({where:{id:log.id,status:'SENDING'},data:{status,error:review?'Delivery result is uncertain. Verify with the provider before retrying.':uncertain?'Delivery result is uncertain. The worker will retry using the original idempotency key within its safe retry window.':error instanceof EmailDeliveryError?error.message:'Email delivery failed. Check provider configuration and delivery logs before retrying.'}});
  }
 }
 return {processed,configured:configuration.configured};
}
export const eventEmail=(status:string,number:string)=>{
 const copy:Record<string,[string,string]>={UNDER_REVIEW:['We are reviewing your order','Our team is reviewing availability and delivery details. No payment has been collected.'],APPROVED:['Your order has been approved','Availability and delivery eligibility have been reviewed. Your invoice is attached. Payment has not been confirmed.'],PAYMENT_RECEIVED:['Your payment receipt','Thank you. Authorized staff have confirmed receipt of your payment. Your receipt is attached for your records.'],PROCESSING:['Your order is being prepared','Your confirmed order is now being prepared for fulfillment.'],PREPARING_SHIPMENT:['Preparing your shipment','We are preparing your selected pieces for shipment.'],SHIPPED:['Your order is on its way','Your order has shipped. Your tracking details are below.'],OUT_FOR_DELIVERY:['Your order is out for delivery','Your shipment is out for delivery.'],DELIVERED:['Your order has arrived','Your order has been marked delivered. Thank you for bringing your retreat home.'],CANCELLED:['Your order has been cancelled','Your order has been cancelled.'],REJECTED:['An update on your order','We are unable to approve this order. Please contact our team if you would like help choosing another option.'],REFUND_PENDING:['Your refund is being reviewed','Our team is reviewing the refund for your order. This message does not confirm a completed refund.'],REFUNDED:['Your refund has been recorded','Our team has recorded the completed refund for your order. Contact us if you need help checking its status.'],PAYMENT_VERIFICATION:['We are checking your payment','Your payment is being verified. Receipt has not yet been confirmed.'],AWAITING_PAYMENT:['Your order is awaiting payment','Your approved order is awaiting independently confirmed payment.']};
 const [title,body]=copy[status]??['An update on your order',`Your order is now ${status.toLowerCase().replaceAll('_',' ')}.`];return {subject:`${number} · ${title}`,body:`Order ${number}. ${body}`};
};
