import {PrismaPostgresAdapter} from '@prisma/adapter-ppg';
import pg from 'pg';

type Connection=Awaited<ReturnType<PrismaPostgresAdapter['connect']>>;
type Query=Parameters<Connection['queryRaw']>[0];

// adapter-ppg 7.10 leaves PostgreSQL text[] as strings and serializes list
// parameters with String(array). Preserve the native array format in both
// directions until the upstream adapter handles these types.
export function postgresArray(values:unknown[]):string {
 return '{'+values.map(value=>value===null?'NULL':Array.isArray(value)?postgresArray(value):'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}';
}
function parameters(query:Query):Query {
 return {...query,args:query.args.map((value,index)=>query.argTypes[index]?.arity==='list'&&Array.isArray(value)?postgresArray(value):value)};
}
function arrays<T extends Pick<Connection,'queryRaw'|'executeRaw'>>(connection:T):T {
 const query=connection.queryRaw.bind(connection),execute=connection.executeRaw.bind(connection);
 connection.queryRaw=q=>query(parameters(q));
 connection.executeRaw=q=>execute(parameters(q));
 return connection;
}
export class PostgresHttpAdapter extends PrismaPostgresAdapter {
 constructor(connectionString:string){
  const config={connectionString,parsers:[1009,1015,1014].map(oid=>({oid,parse:(value:string|null)=>value===null?null:pg.types.getTypeParser(oid)(value)}))};
  super(config);
 }
 override async connect(){
  const connection=arrays(await super.connect());
  const transaction=connection.startTransaction.bind(connection);
  connection.startTransaction=async level=>arrays(await transaction(level));
  return connection;
 }
}
