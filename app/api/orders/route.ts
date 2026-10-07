import {cart,user,csrf,limit,failure,HttpError} from '@/lib/security';
import {submitOrder,customerOrder} from '@/lib/orders';
import {flushEmails} from '@/lib/email';
import {checkoutSchema} from '@/lib/validation';
export async function POST(req:Request){try{csrf(req);const d=checkoutSchema.parse(await req.json());await limit('checkout',d.email,8);const c=await cart();if(!c)throw new HttpError(400,'Your cart is empty.');const u=await user();const result=await submitOrder(d,c.id,u?.id);await flushEmails();return Response.json({order:customerOrder({...result.order,billingAddress:result.order.shippingAddress,history:[],payments:[],shipments:[],notes:[],emails:[]}),accessToken:result.accessToken},{status:201});}catch(e){return failure(e)}}

