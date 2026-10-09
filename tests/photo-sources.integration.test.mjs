import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {db} from '../lib/db.ts';

const origin=process.env.APP_ORIGIN||'http://127.0.0.1:3000';
const run=process.env.RUN_INTEGRATION==='true';
const gallery=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8')).products[0];
const sourceHash=gallery.images[0].sha256;

test('photography provenance stays in the protected product staff area',{skip:!run,timeout:180000},async()=>{
 const userIds=[];
 async function fixture(role,active=true){
  const token=randomUUID();
  const user=await db.user.create({data:{name:'TEST photo sources',email:'photo-sources-'+randomUUID()+'@example.test',passwordHash:'TEST-only-unusable-password',...(role?{staff:{create:{role,active}}}:{})}});
  userIds.push(user.id);
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
  return 'hrd_session='+token;
 }
 async function sources(cookie){
  const response=await fetch(origin+'/admin/photo-sources',{headers:cookie?{cookie}:undefined});
  assert.equal(response.status,200);
  return response.text();
 }
 try{
  const redirect=await fetch(origin+'/image-credits',{redirect:'manual'});
  assert.equal(redirect.status,307);
  assert.equal(redirect.headers.get('location'),'/terms#image-attribution');
  const publicTerms=await fetch(origin+'/terms').then(response=>response.text());
  assert(publicTerms.includes('id="image-attribution"'));
  assert(!publicTerms.includes(sourceHash));
  const publicStore=await fetch(origin+'/collections/all').then(response=>response.text());
  assert(!publicStore.includes('Photography credits'));
  assert(!publicStore.includes('/admin/photo-sources'));
  for(const oldAsset of ['/images/credits.json','/images/products/credits.json'])assert.equal((await fetch(origin+oldAsset)).status,404);
  const anonymous=await sources();
  assert(!anonymous.includes(sourceHash));
  const customer=await sources(await fixture());
  assert(!customer.includes(sourceHash));
  const support=await sources(await fixture('CUSTOMER_SUPPORT'));
  assert(support.includes('Access is restricted.'));
  assert(!support.includes(sourceHash));
  const inactive=await sources(await fixture('PRODUCT_MANAGER',false));
  assert(!inactive.includes(sourceHash));
  for(const role of ['OWNER','ADMINISTRATOR','PRODUCT_MANAGER']){
   const permitted=await sources(await fixture(role));
   assert(permitted.includes('Photography sources.'));
   assert(permitted.includes(sourceHash));
   assert(permitted.includes(gallery.images[0].source));
  }
 }finally{
  await db.user.deleteMany({where:{id:{in:userIds}}});
  await db.$disconnect();
 }
});
