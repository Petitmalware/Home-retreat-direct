import type {OrderStatus,StaffRole} from '@/generated/prisma/client';
export const rolePermissions:Record<StaffRole,string[]>={
 OWNER:['orders','payments','products','customers','reviews','settings','staff','policies'],
 ADMINISTRATOR:['orders','payments','products','customers','reviews','policies'],
 ORDER_MANAGER:['orders','payments','customers'],
 PRODUCT_MANAGER:['products'],
 CUSTOMER_SUPPORT:['customers','orders:read','reviews'],
};
export const can=(role:StaffRole|undefined,permission:string)=>!!role&&(rolePermissions[role].includes(permission)||permission==='orders:read'&&rolePermissions[role].includes('orders'));
export const transitions:Record<OrderStatus,OrderStatus[]>={
 DRAFT:['ORDER_SUBMITTED'],ORDER_SUBMITTED:['AWAITING_REVIEW'],AWAITING_REVIEW:['UNDER_REVIEW','APPROVED','REJECTED','CANCELLED'],UNDER_REVIEW:['APPROVED','REJECTED','CANCELLED'],APPROVED:['PAYMENT_INSTRUCTIONS_SENT','AWAITING_PAYMENT','CANCELLED'],PAYMENT_INSTRUCTIONS_SENT:['AWAITING_PAYMENT','PAYMENT_VERIFICATION','CANCELLED'],AWAITING_PAYMENT:['PAYMENT_VERIFICATION','PAYMENT_RECEIVED','CANCELLED'],PAYMENT_VERIFICATION:['AWAITING_PAYMENT','PAYMENT_RECEIVED'],PAYMENT_RECEIVED:['PROCESSING','REFUND_PENDING'],PROCESSING:['PREPARING_SHIPMENT','REFUND_PENDING'],PREPARING_SHIPMENT:['SHIPPED','REFUND_PENDING'],SHIPPED:['OUT_FOR_DELIVERY','DELIVERED','REFUND_PENDING'],OUT_FOR_DELIVERY:['DELIVERED','REFUND_PENDING'],DELIVERED:['REFUND_PENDING'],CANCELLED:[],REFUND_PENDING:['REFUNDED'],REFUNDED:[],REJECTED:[],
};
export class WorkflowError extends Error { constructor(message:string){super(message);this.name='WorkflowError'} }
export function requireTransition(from:OrderStatus,to:OrderStatus){if(!transitions[from].includes(to))throw new WorkflowError(`Cannot change ${from.replaceAll('_',' ')} to ${to.replaceAll('_',' ')}.`);}
export const statusLabel=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export const paymentEligible=(s:OrderStatus)=>['AWAITING_PAYMENT','PAYMENT_VERIFICATION'].includes(s);
export function orderTotals(items:{quantity:number;unitPriceCents:number}[],shippingCents:number|null,taxCents:number|null){const subtotalCents=items.reduce((s,i)=>s+i.quantity*i.unitPriceCents,0);return {subtotalCents,totalCents:subtotalCents+(shippingCents??0)+(taxCents??0)}}

