import {PrismaClient} from '@/generated/prisma/client';
import {PrismaPostgresAdapter} from '@prisma/adapter-ppg';
import {PrismaPg} from '@prisma/adapter-pg';
const globalDB=globalThis as unknown as {retreatDB?:PrismaClient};
function create(){const connectionString=process.env.DATABASE_URL;if(!connectionString)throw new Error('Database is not configured.');const adapter=process.env.DATABASE_TRANSPORT==='http'?new PrismaPostgresAdapter({connectionString}):new PrismaPg({connectionString,max:8,connectionTimeoutMillis:15000});return new PrismaClient({adapter});}
export const db=globalDB.retreatDB??create();
if(process.env.NODE_ENV!=='production')globalDB.retreatDB=db;

