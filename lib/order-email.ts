import type {Prisma} from '@/generated/prisma/client';
import {createHmac} from 'node:crypto';
import {HttpError} from './security';
import {orderDocumentAttachment,type OrderDocumentKind} from './order-documents';
import {renderEmailContent,type PreparedEmail,type EmailBusiness} from './email-content';
import {businessEmailAddress,emailChannelForTemplate} from './email-routing';
type TX=Prisma.TransactionClient;
export const orderEmailTemplates=['ORDER_CONFIRMATION','INVOICE','PAYMENT_RECEIPT'] as const;
export type OrderEmailTemplate=typeof orderEmailTemplates[number];
export function orderAccessToken(key:string){return createHmac('sha256',process.env.ENCRYPTION_KEY!).update('order-access:'+key).digest('base64url');}
export const emailDocumentKind=(template:string):OrderDocumentKind|undefined=>['ORDER_RECEIVED','ORDER_CONFIRMATION'].includes(template)?'ORDER_CONFIRMATION':['APPROVED','COST_UPDATED','PAYMENT_INSTRUCTIONS','INVOICE'].includes(template)?'INVOICE':['PAYMENT_RECEIVED','PAYMENT_RECEIPT'].includes(template)?'RECEIPT':undefined;
export async function prepareOrderEmail(tx:TX,to:string,template:string,subject:string,body:string,orderId?:string):Promise<PreparedEmail>{
 const settings=await tx.siteSetting.findMany({where:{key:{in:['storeName','address','supportEmail','phone']}}}),value=(key:string)=>settings.find(item=>item.key===key)?.value||undefined;
 const channel=emailChannelForTemplate(template),business:EmailBusiness={name:value('storeName')??'Home Retreat Direct',address:value('address'),supportEmail:businessEmailAddress(channel),phone:value('phone')};
 const order=orderId?await tx.order.findUnique({where:{id:orderId},include:{items:true,shippingAddress:true,billingAddress:true,payments:true}}):null;
 if(order&&order.email!==to)throw new HttpError(400,'Order documents can only be queued to the order customer.');
 const kind=emailDocumentKind(template),attachments=[];
 if(kind&&order){const document=await orderDocumentAttachment(order,business,kind);attachments.push({...document,content:Buffer.from(document.content).toString('base64')});}
 return {...renderEmailContent(subject,body,business,order??undefined,attachments),channel};
}
export async function prepareOrderTemplate(tx:TX,orderId:string,template:OrderEmailTemplate){
 const order=await tx.order.findUnique({where:{id:orderId},include:{items:true,shippingAddress:true,billingAddress:true,payments:true}});
 if(!order)throw new HttpError(404,'Order not found.');
 const known=order.shippingConfirmed&&order.taxConfirmed&&order.shippingCents!==null&&order.taxCents!==null;
 const received=order.payments.filter(payment=>['CONFIRMED','REFUNDED'].includes(payment.status)).reduce((sum,payment)=>sum+payment.amountReceivedCents,0);
 const approved=['APPROVED','PAYMENT_INSTRUCTIONS_SENT','AWAITING_PAYMENT','PAYMENT_VERIFICATION','PAYMENT_RECEIVED','PROCESSING','PREPARING_SHIPMENT','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','REFUND_PENDING','REFUNDED'].includes(order.status);
 if(template==='INVOICE'&&(!known||!approved))throw new HttpError(409,'An invoice is available after order approval and confirmation of shipping and tax.');
 if(template==='PAYMENT_RECEIPT'&&(!known||received<order.totalCents||order.totalCents<=0))throw new HttpError(409,'A receipt is available only after payment has been confirmed.');
 const url=`${process.env.APP_ORIGIN}/orders/${order.number}?token=${orderAccessToken(order.idempotencyKey)}`;
 const messages={ORDER_CONFIRMATION:{subject:order.number+' · Order confirmation',body:`Thank you for your order ${order.number}. Your selected pieces and order summary are included below. ${known?'Your order has been reviewed.':'We will confirm availability, delivery and the final amount before requesting payment.'} This confirmation is not a payment receipt.\n\nView your order: ${url}`},INVOICE:{subject:order.number+' · Your invoice',body:`Your invoice for order ${order.number} is attached. It includes your selected pieces and confirmed shipping and tax. ${received>=order.totalCents?'Payment has been confirmed.':'Payment has not been confirmed; use only the business payment instructions provided for your approved order.'}\n\nView your order: ${url}`},PAYMENT_RECEIPT:{subject:order.number+' · Your payment receipt',body:`Thank you. Payment for order ${order.number} has been confirmed. Your receipt is attached for your records.${order.status==='REFUNDED'?' A refund has subsequently been recorded for this order.':''}\n\nView your order: ${url}`}};
 const message=messages[template];return {order,...message,content:await prepareOrderEmail(tx,order.email,template,message.subject,message.body,orderId)};
}
