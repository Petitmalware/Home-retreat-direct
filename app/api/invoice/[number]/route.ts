import {orderAccess} from '@/lib/orders';import {user,failure,HttpError} from '@/lib/security';import {can} from '@/lib/workflow';import {db} from '@/lib/db';import {orderDocumentPDF,defaultOrderDocumentKind,orderDocumentFilename} from '@/lib/order-documents';import {z} from 'zod';
export async function GET(req:Request,{params}:{params:Promise<{number:string}>}){try{
 const{number}=await params,u=await user(),isStaff=u?.staff?.active&&can(u.staff.role,'orders:read'),query=new URL(req.url).searchParams;
 const o=isStaff?await db.order.findUnique({where:{number},include:{items:true,shippingAddress:true,billingAddress:true,payments:true}}):await orderAccess(number,query.get('token')??undefined,u?.id);if(!o)throw new HttpError(404,'Order not found.');
 const kind=z.enum(['ORDER_CONFIRMATION','INVOICE','RECEIPT']).optional().parse(query.get('kind')??undefined)??defaultOrderDocumentKind(o);
 const settings=await db.siteSetting.findMany(),value=(key:string)=>settings.find(setting=>setting.key===key)?.value||undefined;
 let bytes:Uint8Array;try{bytes=await orderDocumentPDF(o,{name:value('storeName')??'Home Retreat Direct',address:value('address'),supportEmail:value('supportEmail'),phone:value('phone')},kind);}catch(error){throw new HttpError(409,error instanceof Error?error.message:'This document is not available at the current order stage.');}
 return new Response(bytes as unknown as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${orderDocumentFilename(kind,o.number)}"`,'Cache-Control':'private, no-store'}});
}catch(error){return failure(error)}}

