import {db} from '@/lib/db';
import {csrf,failure,limit,setSession,user,hash as hashToken} from '@/lib/security';
import {registrationSchema,loginSchema} from '@/lib/validation';
import {hash,compare} from 'bcryptjs';
import {cookies} from 'next/headers';
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){try{csrf(req);const{action}=await params;if(action==='logout'){const t=(await cookies()).get('hrd_session')?.value;if(t)await db.session.deleteMany({where:{tokenHash:hashToken(t)}});(await cookies()).delete('hrd_session');return Response.json({ok:true});}
 const raw=await req.json();if(action==='register'){const d=registrationSchema.parse(raw);await limit('register',d.email,5);if(await db.user.findUnique({where:{email:d.email}}))return Response.json({error:'An account with this email already exists.'},{status:409});const u=await db.user.create({data:{name:d.name,email:d.email,passwordHash:await hash(d.password,12),customer:{create:{}}}});await setSession(u.id);return Response.json({ok:true});}
 if(action==='login'){const d=loginSchema.parse(raw);await limit('login',d.email,10);const u=await db.user.findUnique({where:{email:d.email}});const dummy='$2b$12$wHKOFHXuaWBKC3ZZ/FblC.IL.jgAfeGgk.Tw3dbATdzEhiDfrtbSq';const valid=await compare(d.password,u?.passwordHash??dummy);if(!u||!valid)return Response.json({error:'Email or password is incorrect.'},{status:401});await setSession(u.id);return Response.json({ok:true});}return Response.json({error:'Not found'},{status:404});}catch(e){return failure(e)}}
export async function GET(){try{const u=await user();return Response.json({user:u?{id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.staff?.active?u.staff.role:null}:null});}catch(e){return failure(e)}}

