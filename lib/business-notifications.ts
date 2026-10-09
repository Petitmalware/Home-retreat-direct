import type {Prisma} from '@/generated/prisma/client';
import {businessEmails,businessProfile} from './business-profile';
import {queuePreparedEmail} from './email';
import {renderEmailContent} from './email-content';
import {mailboxSchema} from './email-routing';

export async function queueStaffOrderNotification(tx:Prisma.TransactionClient,order:{id:string;number:string;email:string},event:'submitted'|'approved'|'payment-received'){
 const settings=Object.fromEntries((await tx.siteSetting.findMany({where:{key:{in:['storeName','ordersEmail']}}})).map(item=>[item.key,item.value]));
 const address=mailboxSchema.parse(businessEmails(settings).ordersEmail),name=settings.storeName||businessProfile.name;
 const labels={submitted:'New order awaiting review',approved:'Order approved','payment-received':'Payment confirmed'};
 const subject=`${order.number} · ${labels[event]}`;
 const url=new URL('/admin/orders/'+encodeURIComponent(order.id),process.env.APP_ORIGIN).href;
 const body=`${labels[event]}: ${order.number}.\nCustomer: ${order.email}.\nOpen the staff order page to review items, charges, customer details and next steps:\n${url}`;
 const content={...renderEmailContent(subject,body,{name,supportEmail:address}),channel:'orders' as const,replyTo:mailboxSchema.parse(order.email)};
 return queuePreparedEmail(tx,address,'ORDER_STAFF_ALERT_'+event.toUpperCase().replaceAll('-','_'),subject,content,order.id);
}
