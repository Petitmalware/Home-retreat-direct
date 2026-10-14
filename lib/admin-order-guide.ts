import {can} from './workflow';
import type {StaffRole} from '@/generated/prisma/client';

export const orderSteps=['Review order','Request payment','Confirm payment','Send shipment','Delivered'];
export const actionLabels:Record<string,string>={
 review:'Start reviewing',approve:'Approve & send invoice','request-payment':'Send payment instructions',
 'verify-payment':'Check a reported payment','payment-not-found':'Payment not found',
 'confirm-payment':'Confirm payment & send receipt',processing:'Start preparing the order',preparing:'Prepare shipment',
 ship:'Add tracking & mark shipped','out-for-delivery':'Mark out for delivery',deliver:'Mark delivered',
 'update-costs':'Correct shipping or tax',reject:'Decline order',cancel:'Cancel order',
 'refund-pending':'Start refund review','refund-record':'Record completed refund',note:'Add staff note',email:'Write a customer email',
};
const guides:Record<string,{step:number;action?:string;title:string;description:string;email:string;other?:string[]}>={
 AWAITING_REVIEW:{step:0,action:'approve',title:'Check this order, then approve it',description:'Confirm the products are available, check the delivery address, and enter the actual shipping and tax amounts.',email:'Approval automatically sends the customer an invoice. The order confirmation was queued when they placed the order.',other:['review','reject','cancel']},
 UNDER_REVIEW:{step:0,action:'approve',title:'Finish the order review',description:'Confirm availability and delivery, then enter shipping and tax to approve the final total.',email:'Approval automatically sends the invoice. You do not need to send it separately.',other:['reject','cancel']},
 APPROVED:{step:1,action:'request-payment',title:'Tell the customer how to pay',description:'Choose your saved business payment method. The customer will receive its instructions and the approved invoice.',email:'This sends payment instructions with the invoice attached. It does not mark the order as paid.',other:['update-costs','cancel']},
 AWAITING_PAYMENT:{step:2,action:'confirm-payment',title:'Wait for payment, then check your account',description:'Check your bank or payment provider yourself. Continue only when the full approved amount has actually arrived.',email:'Confirming payment automatically sends the payment receipt. A customer screenshot alone does not confirm payment.',other:['verify-payment','cancel']},
 PAYMENT_VERIFICATION:{step:2,action:'confirm-payment',title:'Check whether the payment arrived',description:'Match the received amount and bank or processor reference to this order. If you cannot find it, return the order to awaiting payment.',email:'Confirming the funds sends the receipt automatically.',other:['payment-not-found']},
 PAYMENT_RECEIVED:{step:3,action:'processing',title:'Begin preparing the paid order',description:'The payment is confirmed. Start preparing the items for your customer.',email:'The payment receipt has already been queued. Starting preparation sends an order update.',other:['refund-pending']},
 PROCESSING:{step:3,action:'preparing',title:'Prepare the shipment',description:'Arrange packing and delivery. Continue when you are preparing the shipment.',email:'The customer receives a preparation update automatically.',other:['refund-pending']},
 PREPARING_SHIPMENT:{step:3,action:'ship',title:'Send the shipment and add tracking',description:'Enter the carrier and tracking number after handing the shipment to the carrier.',email:'Marking it shipped automatically emails the tracking details.',other:['refund-pending']},
 SHIPPED:{step:3,action:'deliver',title:'Follow the delivery',description:'Check carrier tracking. Mark delivered only after delivery is confirmed.',email:'Marking delivered sends a delivery update and a review invitation for each purchased item.',other:['out-for-delivery','refund-pending']},
 OUT_FOR_DELIVERY:{step:3,action:'deliver',title:'Confirm delivery',description:'Wait for the carrier to confirm delivery, then finish this order.',email:'The customer receives a delivery update and review invitations.',other:['refund-pending']},
 DELIVERED:{step:4,title:'This order is complete',description:'Keep the saved order and payment records for customer support.',email:'Delivery emails and review invitations have been queued.',other:['refund-pending']},
 REFUND_PENDING:{step:-1,action:'refund-record',title:'Complete the refund, then record it here',description:'Issue the actual refund through your bank or payment provider first. Then record its reference here.',email:'Recording the completed refund sends a confirmation. This button does not transfer money.'},
 REFUNDED:{step:-1,title:'Refund recorded',description:'The original payment receipt remains part of this order’s history.',email:'The refund confirmation has been queued.'},
 CANCELLED:{step:-1,title:'Order cancelled',description:'No further order action is needed.',email:'The customer cancellation notice has been queued.'},
 REJECTED:{step:-1,title:'Order declined',description:'No further order action is needed. You can still answer customer questions.',email:'The customer has been sent an order update.'},
};
const financial=new Set(['request-payment','confirm-payment','verify-payment','payment-not-found','refund-pending','refund-record']);
export function adminOrderGuide(status:string,role:StaffRole){
 const guide=guides[status]??{step:-1,title:'Order received',description:'Review the saved order details below.',email:'Check the email history for customer messages.'};
 const permitted=(action:string)=>can(role,financial.has(action)?'payments':'orders');
 return {...guide,action:guide.action&&permitted(guide.action)?guide.action:undefined,other:(guide.other??[]).filter(permitted)};
}
