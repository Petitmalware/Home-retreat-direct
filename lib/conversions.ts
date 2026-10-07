import type {Prisma,OrderStatus} from '@/generated/prisma/client';
export type Conversion='submit_order'|'order_approved'|'payment_received'|'purchase';
export const mayRecordPurchase=(status:OrderStatus,confirmed:boolean,isDemo:boolean)=>status==='PAYMENT_RECEIVED'&&confirmed&&!isDemo;
export async function recordConversion(tx:Prisma.TransactionClient,type:Conversion,order:{id:string;totalCents:number;isDemo:boolean;status?:OrderStatus},paymentConfirmed=false){
 if(type==='purchase'&&!mayRecordPurchase(order.status??'AWAITING_REVIEW',paymentConfirmed,order.isDemo))return;
 await tx.analyticsEvent.upsert({where:{eventKey:order.id+':'+type},create:{eventKey:order.id+':'+type,type,orderId:order.id,valueCents:order.totalCents,isDemo:order.isDemo},update:{}});
}
