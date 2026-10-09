import {PrismaClient} from '@/generated/prisma/client';
import {PostgresHttpAdapter} from './postgres-http';
import {PrismaPg} from '@prisma/adapter-pg';
const globalDB=globalThis as unknown as {retreatDB?:PrismaClient};
function create(){const connectionString=process.env.DATABASE_URL;if(!connectionString)throw new Error('Database is not configured.');const adapter=process.env.DATABASE_TRANSPORT==='http'?new PostgresHttpAdapter(connectionString):new PrismaPg({connectionString,max:process.env.LOCAL_DATABASE_ENGINE==='pglite'?1:8,connectionTimeoutMillis:15000});return new PrismaClient({adapter});}
export const db=globalDB.retreatDB??create();
if(process.env.NODE_ENV!=='production')globalDB.retreatDB=db;

