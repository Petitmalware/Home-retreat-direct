import {z} from 'zod';
import {localMediaUrl} from './media-paths';
export const email=z.string().trim().email().max(254).transform(s=>s.toLowerCase());
export const addressSchema=z.object({firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),company:z.string().trim().max(120).optional(),line1:z.string().trim().min(3).max(150),line2:z.string().trim().max(100).optional(),city:z.string().trim().min(2).max(80),state:z.string().regex(/^[A-Z]{2}$/,'Use a two-letter state code'),postalCode:z.string().regex(/^\d{5}(-\d{4})?$/,'Enter a valid U.S. ZIP code'),country:z.literal('US')});
export const registrationSchema=z.object({name:z.string().trim().min(2).max(100),email,password:z.string().min(12,'Use at least 12 characters').max(72).refine(v=>new TextEncoder().encode(v).length<=72,'Use at most 72 password bytes')});
export const loginSchema=z.object({email,password:z.string().min(1).max(72)});
export const checkoutSchema=z.object({email,phone:z.string().trim().regex(/^[+()\d\s.-]{7,25}$/,'Enter a valid phone number'),shipping:addressSchema,billing:addressSchema.optional(),deliveryNotes:z.string().max(2000).optional(),contactMethod:z.enum(['Email','Phone']).default('Email'),acceptTerms:z.literal(true,{errorMap:()=>({message:'Accept the policies to submit your order'})}),idempotencyKey:z.string().uuid()});
const safeImage=z.string().url().max(2048).refine(u=>u.startsWith('https://res.cloudinary.com/'));
export const reviewSchema=z.object({rating:z.number().int().min(1).max(5),title:z.string().trim().min(3).max(120),body:z.string().trim().min(15).max(5000),name:z.string().trim().min(2).max(100),email,token:z.string().min(32).max(128).optional(),productId:z.string().trim().min(1).max(100).optional(),photos:z.array(z.object({url:safeImage,grant:z.string().max(200)})).max(4).optional(),orderNumber:z.string().trim().max(50).optional()}).strict().refine(d=>!!d.token||!!d.productId,{message:'Select a product to review.',path:['productId']});
export const itemSchema=z.object({variantId:z.string().min(1).max(100),quantity:z.number().int().min(1).max(20)});
export const cents=z.number().int().min(0).max(100000000);
export const safeMediaUrl=z.string().max(2048).refine(s=>s.startsWith('/diagrams/')||s.startsWith('/images/')||s.startsWith('https://res.cloudinary.com/')||localMediaUrl.test(s),'Use an uploaded image or a local catalog image');

