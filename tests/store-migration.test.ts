import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {spawn} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';

test('encrypted store migration preserves arrays and relations and refuses nonempty targets',{timeout:120000},async()=>{
 const directory=await fs.mkdtemp(path.join(tmpdir(),'hrd-migration-test-')),archive=path.join(directory,'store.hrd');
 const source=await PGlite.create(),target=await PGlite.create();let sourceSocket:PGLiteSocketServer|undefined,targetSocket:PGLiteSocketServer|undefined;
 const schema=`CREATE TABLE "_prisma_migrations"(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz);
 CREATE TABLE "User"(id text PRIMARY KEY,email text); CREATE TABLE "Product"(id text PRIMARY KEY,features text[]);
 CREATE TABLE "Order"(id text PRIMARY KEY,"userId" text REFERENCES "User"(id),"productId" text REFERENCES "Product"(id),"totalCents" integer);
 CREATE TABLE "SiteSetting"(key text PRIMARY KEY,value text);
 INSERT INTO "_prisma_migrations" VALUES('isolated-test','test-checksum',now(),null);`;
 const migrationKey=Buffer.from(randomBytes(32)).toString('hex');
 const run=(action:string,url:string,key=migrationKey)=>new Promise<{code:number|null;output:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['deploy/migrate-store.mjs',action,archive],{cwd:process.cwd(),windowsHide:true,env:{...process.env,DATABASE_URL:url,SOURCE_DATABASE_URL:url,MIGRATION_KEY:key,EMAIL_DELIVERY_ENABLED:'false',IMPORT_PRODUCTION_CONFIRMED:'homeretreatdirect.com'}});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.once('error',reject);child.once('exit',code=>resolve({code,output}));
 });
 try{
  await source.exec(schema);await target.exec(schema);
  await source.query('INSERT INTO "User" VALUES($1,$2)',['fixture','fixture@example.test']);
  const features=['Cushion, back','Unicode café','Quote " and slash \\'];await source.query('INSERT INTO "Product" VALUES($1,$2)',['fixture-product',features]);
  await source.exec(`INSERT INTO "Order" VALUES('fixture-order','fixture','fixture-product',123456); INSERT INTO "SiteSetting" VALUES('launchApproved','true');`);
  sourceSocket=new PGLiteSocketServer({db:source,host:'127.0.0.1',port:0});targetSocket=new PGLiteSocketServer({db:target,host:'127.0.0.1',port:0});await sourceSocket.start();await targetSocket.start();
  const sourceUrl='postgresql://postgres:isolated@'+sourceSocket.getServerConn()+'/postgres',targetUrl='postgresql://postgres:isolated@'+targetSocket.getServerConn()+'/postgres';
  const exported=await run('export',sourceUrl);assert.equal(exported.code,0,exported.output);assert(!(await fs.readFile(archive)).includes(Buffer.from('fixture@example.test')));
  assert.equal((await run('verify',targetUrl)).code,0);assert.notEqual((await run('verify',targetUrl,Buffer.from(randomBytes(32)).toString('hex'))).code,0);
  const imported=await run('import',targetUrl);assert.equal(imported.code,0,imported.output);
  assert.deepEqual((await target.query<{features:string[]}>('SELECT features FROM "Product"')).rows[0].features,features);
  assert.equal((await target.query<{totalCents:number}>('SELECT "totalCents" FROM "Order"')).rows[0].totalCents,123456);
  assert.equal((await target.query<{value:string}>('SELECT value FROM "SiteSetting"')).rows[0].value,'false');
  const repeated=await run('import',targetUrl);assert.notEqual(repeated.code,0);assert.match(repeated.output,/already contains store records/);
  assert.equal((await target.query('SELECT * FROM "Order"')).rows.length,1);
 }finally{
  await sourceSocket?.stop();await targetSocket?.stop();await source.close();await target.close();
  assert(directory.startsWith(path.join(tmpdir(),'hrd-migration-test-')));await fs.rm(directory,{recursive:true,force:true});
 }
});
