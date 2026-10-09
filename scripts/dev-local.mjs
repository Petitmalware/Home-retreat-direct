import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {createServer} from 'node:http';
import {parse} from 'dotenv';
import pg from 'pg';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
async function listening(port){return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});const finish=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(false));});}
if(await listening(3000)){
 if(fs.existsSync(path.join(local,'launcher.json'))){console.log('Home Retreat Direct is already running at http://localhost:3000. Use npm run stop:local to stop it.');process.exit(0);}
 throw new Error('Port 3000 is already in use. Stop the existing local server before starting this task.');
}
if(await listening(54329))throw new Error('The local database port is already in use. Stop the previous local task before starting another.');
const readEnv=file=>fs.existsSync(file)?parse(fs.readFileSync(file)):{};
const previous=readEnv('.env');
const platform=process.platform==='win32'?'windows':process.platform;
const binaries=await import(`@embedded-postgres/${platform}-${process.arch}`).catch(()=>null);
const localHost=value=>{try{return ['localhost','127.0.0.1','::1'].includes(new URL(value).hostname);}catch{return false;}};
if(previous.DATABASE_URL&&!localHost(previous.DATABASE_URL)&&!fs.existsSync('.env.hosted')){
 fs.copyFileSync('.env','.env.hosted');
 console.log('Saved the previous cloud configuration privately in .env.hosted.');
}
let configuration=previous;
if(!fs.existsSync(path.join(local,'configured.json'))){
 const password=randomBytes(24).toString('hex');
 const connection=`postgresql://retreat_local:${password}@127.0.0.1:54329/home_retreat`;
 configuration={...previous,DATABASE_URL:connection,DIRECT_DATABASE_URL:connection,DATABASE_TRANSPORT:'pg',APP_ORIGIN:'http://localhost:3000',SITES_RUNTIME:'false',DEVELOPMENT_CATALOG:'true',SHOW_DEMO_REVIEWS:'false',ENCRYPTION_KEY:previous.ENCRYPTION_KEY||randomBytes(32).toString('hex'),SEED_OWNER_EMAIL:previous.SEED_OWNER_EMAIL||'owner@home-retreat.local',SEED_OWNER_PASSWORD:previous.SEED_OWNER_PASSWORD||randomBytes(24).toString('base64url')};
 fs.writeFileSync('.env',Object.entries(configuration).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});
 fs.writeFileSync(path.join(local,'configured.json'),JSON.stringify({database:'home_retreat',port:54329}),{mode:0o600});
}
if(!localHost(configuration.DATABASE_URL))throw new Error('The local launcher only starts a loopback PostgreSQL database.');
const url=new URL(configuration.DATABASE_URL),port=Number(url.port),user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
let database=url.pathname.slice(1);const data=path.join(local,'postgres'),env={...process.env,...configuration};
function binary(file,args,quiet=false){
 const result=spawnSync(file,args,{cwd:root,env,encoding:'utf8',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error((result.stderr||result.stdout||'Database command failed.').replaceAll(password,'[redacted]'));
 if(!quiet&&result.stdout)process.stdout.write(result.stdout);
}
function node(args){
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Local setup step failed.')));});
}
let portable=!binaries||fs.existsSync(path.join(local,'pglite-runtime.json'));
if(!portable&&!fs.existsSync(path.join(data,'PG_VERSION'))){
 const passwordFile=path.join(local,'init-password.txt');fs.writeFileSync(passwordFile,password,{mode:0o600});
 try{binary(binaries.initdb,['-D',data,'-U',user,'--pwfile',passwordFile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C'],true);console.log('Initialized persistent local PostgreSQL.');}catch(error){if(!String(error.message).includes('0xC0000005'))throw error;portable=true;fs.writeFileSync(path.join(local,'pglite-runtime.json'),JSON.stringify({reason:'Windows PostgreSQL bootstrap access violation'}));console.log('Using portable PostgreSQL (PGlite) for this local development copy.');}finally{fs.unlinkSync(passwordFile);}
}
let portableDatabase,portableServer;
if(portable){
 const {PGlite}=await import('@electric-sql/pglite');const {PGLiteSocketServer}=await import('@electric-sql/pglite-socket');
 database='postgres';url.pathname='/postgres';configuration={...configuration,DATABASE_URL:url.toString(),DIRECT_DATABASE_URL:url.toString(),LOCAL_DATABASE_ENGINE:'pglite'};Object.assign(env,configuration);
 fs.writeFileSync('.env',Object.entries(configuration).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});
 portableDatabase=await PGlite.create(path.join(local,'pglite'));
 portableServer=new PGLiteSocketServer({db:portableDatabase,host:'127.0.0.1',port,maxConnections:20});await portableServer.start();
}
const status=portable?{status:0}:spawnSync(binaries.pg_ctl,['status','-D',data],{encoding:'utf8',windowsHide:true});
const ownsDatabase=!portable&&status.status!==0;
if(ownsDatabase)binary(binaries.pg_ctl,['start','-D',data,'-l',path.join(local,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','30'],true);
let server,control,stopping=false;
async function stop(){
 if(stopping)return;stopping=true;
 if(server&&!server.killed){if(process.platform==='win32'&&server.pid)spawnSync('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else server.kill('SIGTERM');}
 if(control)await new Promise(resolve=>control.close(resolve));
 if(ownsDatabase){const result=spawnSync(binaries.pg_ctl,['stop','-D',data,'-m','fast','-w','-t','20'],{encoding:'utf8',windowsHide:true});if(result.status!==0)console.error('PostgreSQL did not stop cleanly; see .local/postgres.log.');}
 if(portableServer)await portableServer.stop();if(portableDatabase)await portableDatabase.close();
 const launcher=path.join(local,'launcher.json');if(fs.existsSync(launcher)&&JSON.parse(fs.readFileSync(launcher,'utf8')).pid===process.pid)fs.unlinkSync(launcher);
}
process.on('SIGINT',async()=>{await stop();process.exit(0);});process.on('SIGTERM',async()=>{await stop();process.exit(0);});
const identifier=name=>'"'+name.replaceAll('"','""')+'"';
async function copyExisting(){
 const source=readEnv('.env.hosted').DATABASE_URL;
 if(!source||localHost(source))return false;
 const remote=new pg.Client({connectionString:source,connectionTimeoutMillis:15000}),target=new pg.Client({connectionString:configuration.DATABASE_URL});
 await remote.connect();await target.connect();
 try{
  const tables=(await remote.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name")).rows.map(row=>row.table_name);
  for(const table of tables){if(Number((await target.query(`SELECT count(*) AS total FROM ${identifier(table)}`)).rows[0].total)!==0)throw new Error('Local tables already contain data; automatic copy will not overwrite them.');}
  await remote.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const dependencies=(await remote.query("SELECT child.relname AS child, parent.relname AS parent FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'")).rows;
  const snapshots=[];
  for(const table of tables){const result=await remote.query(`SELECT * FROM ${identifier(table)}`);snapshots.push({table,columns:result.fields.map(field=>field.name),rows:result.rows});}
  await remote.query('COMMIT');
  fs.mkdirSync(path.join(local,'backups'),{recursive:true});
  fs.writeFileSync(path.join(local,'backups','cloud-before-local.json'),JSON.stringify({createdAt:new Date().toISOString(),tables:snapshots}),{mode:0o600});
  const order=[],pending=new Set(tables);
  while(pending.size){const ready=[...pending].filter(table=>dependencies.every(edge=>edge.child!==table||edge.parent===table||!pending.has(edge.parent)));if(!ready.length)throw new Error('Database dependencies need manual migration.');for(const table of ready){pending.delete(table);order.push(table);}}
  await target.query('BEGIN');
  for(const table of order){const snapshot=snapshots.find(item=>item.table===table);for(const row of snapshot.rows){const columns=snapshot.columns,values=columns.map(column=>row[column]);await target.query(`INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);}}
  await target.query('COMMIT');
  const counts=Object.fromEntries(snapshots.filter(item=>['Product','Order','User'].includes(item.table)).map(item=>[item.table,item.rows.length]));
  console.log('Copied the existing cloud data into local PostgreSQL: '+JSON.stringify(counts));
  return true;
 }catch(error){await remote.query('ROLLBACK').catch(()=>{});await target.query('ROLLBACK').catch(()=>{});throw error;}
 finally{await remote.end();await target.end();}
}
try{
 const admin=new pg.Client({host:'127.0.0.1',port,user,password,database:'postgres'});await admin.connect();
 try{if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)await admin.query(`CREATE DATABASE ${identifier(database)}`);}finally{await admin.end();}
 if(!fs.existsSync('generated/prisma/client.ts'))await node(['node_modules/prisma/build/index.js','generate']);
 if(portable){
  await portableDatabase.exec('CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)');
  for(const folder of fs.readdirSync('prisma/migrations').sort()){
   const file=path.join('prisma/migrations',folder,'migration.sql');if(!fs.existsSync(file))continue;
   const sql=fs.readFileSync(file,'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
   const applied=await portableDatabase.query('SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL',[folder]);
   if(applied.rows.length){if(applied.rows[0].checksum!==checksum)throw new Error('An applied local migration has changed: '+folder);continue;}
   await portableDatabase.transaction(async transaction=>{await transaction.exec(sql);await transaction.query('INSERT INTO "_prisma_migrations" (id,checksum,migration_name,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)',[randomUUID(),checksum,folder]);});
  }
  console.log('Local PostgreSQL migrations are current.');
 }else await node(['node_modules/prisma/build/index.js','migrate','deploy']);
 if(!fs.existsSync(path.join(local,'data-ready.json'))){
  const copied=await copyExisting();
  if(!copied)await node(['node_modules/tsx/dist/cli.mjs','prisma/seed.ts']);
  fs.writeFileSync(path.join(local,'data-ready.json'),JSON.stringify({copied,completedAt:new Date().toISOString()}),{mode:0o600});
 }
 if(fs.existsSync('data/real-product-photos.json'))await node(['node_modules/tsx/dist/cli.mjs','scripts/import-real-product-photos.ts']);
 if(fs.existsSync('data/product-galleries.json')&&JSON.parse(fs.readFileSync('data/product-galleries.json','utf8')).products.length)await node(['node_modules/tsx/dist/cli.mjs','scripts/import-product-galleries.ts']);
 if(fs.existsSync('data/product-galleries.json')&&JSON.parse(fs.readFileSync('data/product-galleries.json','utf8')).products.every(p=>p.priceCents>0))await node(['node_modules/tsx/dist/cli.mjs','scripts/import-retail-catalog.ts']);
 if(fs.existsSync('data/retail-content.json'))await node(['node_modules/tsx/dist/cli.mjs','scripts/import-retail-content.ts']);
 if(fs.existsSync('scripts/import-source-variants.ts'))await node(['node_modules/tsx/dist/cli.mjs','scripts/import-source-variants.ts']);
 fs.writeFileSync(path.join(local,'ADMIN-ACCESS.txt'),`Local store: http://localhost:3000\nAdmin: http://localhost:3000/admin\nInitial owner email: ${configuration.SEED_OWNER_EMAIL}\nInitial owner password: ${configuration.SEED_OWNER_PASSWORD}\nIf the owner password was changed, keep using that changed password.\nThis private file is excluded from Git and source archives.\n`,{mode:0o600});
 console.log('Starting local store at http://localhost:3000');
 console.log('Initial admin access is in .local/ADMIN-ACCESS.txt.');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],{cwd:root,env,stdio:'inherit',windowsHide:true});
 const controlToken=randomBytes(32).toString('base64url');
 control=createServer((request,response)=>{
  if(request.method!=='POST'||request.url!=='/stop'||request.headers.authorization!=='Bearer '+controlToken){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':'application/json'}).end('{"stopping":true}');void stop();
 });
 await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(0,'127.0.0.1',resolve);});
 fs.writeFileSync(path.join(local,'launcher.json'),JSON.stringify({pid:process.pid,port:control.address().port,token:controlToken}),{mode:0o600});
 server.on('error',async error=>{console.error(error.message);await stop();process.exitCode=1;});
 server.on('exit',async code=>{const intentional=stopping;await stop();process.exitCode=intentional?0:code??0;});
}catch(error){await stop();console.error((error instanceof Error?error.message:String(error)).replaceAll(password,'[redacted]'));process.exitCode=1;}
