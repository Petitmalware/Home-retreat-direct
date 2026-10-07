import {z} from 'zod';
import {db} from '@/lib/db';
import {csrf,limit,failure,HttpError} from '@/lib/security';
import {email} from '@/lib/validation';
export async function POST(req:Request){try{csrf(req);const d=z.object({number:z.string().trim().min(3).max(50),email}).parse(await req.json());await limit('tracking',d.email,15);const o=await db.order.findFirst({where:{number:{equals:d.number,mode:'insensitive'},email:d.email},include:{shipments:true,history:{orderBy:{createdAt:'asc'}},payments:{where:{status:'CONFIRMED'}}}});if(!o)throw new HttpError(404,'No matching order was found. Check the order number and email.');return Response.json({number:o.number,status:o.status,paymentReceived:!!o.payments.length,shipments:o.shipments.map(s=>({carrier:s.carrier,trackingNumber:s.trackingNumber,trackingUrl:s.trackingUrl,shippedAt:s.shippedAt,deliveredAt:s.deliveredAt})),history:o.history.map(h=>({status:h.status,createdAt:h.createdAt}))});}catch(e){return failure(e)}}

