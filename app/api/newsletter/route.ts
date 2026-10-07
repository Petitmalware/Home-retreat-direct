import {db} from '@/lib/db';import {csrf,limit,failure} from '@/lib/security';import {email} from '@/lib/validation';import {z} from 'zod';
export async function POST(req:Request){try{csrf(req);const d=z.object({email,consent:z.literal(true)}).parse(await req.json());await limit('newsletter',d.email,3);await db.newsletterSubscriber.upsert({where:{email:d.email},create:{email:d.email},update:{}});return Response.json({ok:true});}catch(e){return failure(e)}}

