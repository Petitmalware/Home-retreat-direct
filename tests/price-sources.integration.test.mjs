import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {db} from '../lib/db.ts';

const origin=process.env.APP_ORIGIN||'http://127.0.0.1:3000';
const run=process.env.RUN_INTEGRATION==='true';
const records=JSON.parse(fs.readFileSync('data/price-sources.json','utf8'));
const verified=records.products.find(source=>source.status==='verified'&&source.sourceUrl&&source.priceCents>0);
const unverified=records.products.find(source=>source.status==='unverified'&&source.reason);
const encode=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#x27;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const dollars=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);

test('pricing source evidence is visible only to authorized product staff',{skip:!run,timeout:180000},async t=>{
 const userIds=[];
 async function fixture(role,active=true){
  const token=randomUUID();
  const user=await db.user.create({data:{name:'TEST pricing sources',email:'pricing-sources-'+randomUUID()+'@example.test',passwordHash:'TEST-only-unusable-password',...(role?{staff:{create:{role,active}}}:{})}});
  userIds.push(user.id);
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
  return 'hrd_session='+token;
 }
 async function page(cookie){
  const response=await fetch(origin+'/admin/price-sources',{headers:cookie?{cookie}:undefined});
  assert.equal(response.status,200);
  return response.text();
 }
 function privateDataAbsent(html){
  assert(!html.includes('data-price-source-id='));
  if(verified)assert(!html.includes(encode(verified.sourceUrl)));
  if(unverified)assert(!html.includes(encode(unverified.reason)));
 }
 try{
  await t.test('source records are absent from public assets and storefront HTML',async()=>{
   for(const asset of ['/data/price-sources.json','/price-sources.json','/images/price-sources.json'])assert.equal((await fetch(origin+asset)).status,404);
   for(const path of ['/','/collections/all']){
    const response=await fetch(origin+path);assert.equal(response.status,200);
    const html=await response.text();privateDataAbsent(html);assert(!html.includes('/admin/price-sources'));
   }
  });
  await t.test('anonymous customers and inactive staff receive no evidence',async()=>{
   privateDataAbsent(await page());
   privateDataAbsent(await page(await fixture()));
   privateDataAbsent(await page(await fixture('PRODUCT_MANAGER',false)));
  });
  await t.test('customer support cannot view pricing evidence',async()=>{
   const html=await page(await fixture('CUSTOMER_SUPPORT'));
   assert(html.includes('Access is restricted.'));privateDataAbsent(html);
  });
  await t.test('owner administrator and product manager see evidence and current database prices',async()=>{
   assert(verified,'A verified source price is needed for this regression check.');
   assert(unverified,'An unresolved source is needed for the privacy regression check.');
   const product=await db.product.findUniqueOrThrow({where:{id:verified.id},select:{priceCents:true,discountPercent:true,variants:{select:{id:true,active:true}}}});
   const retired=await db.productVariant.findFirst({where:{productId:{in:records.products.map(source=>source.id)},active:false},select:{id:true,priceCents:true}});
   const sale=Math.max(1,Math.round(product.priceCents*(100-product.discountPercent)/100));
   for(const role of ['OWNER','ADMINISTRATOR','PRODUCT_MANAGER']){
    const html=await page(await fixture(role));
    assert(html.includes('Pricing sources.'));
    assert(html.includes('data-price-source-id="'+verified.id+'"'));
    assert(html.includes('data-price-count="verified">'+records.products.filter(source=>source.status==='verified').length+'<'));
    assert(html.includes('data-price-count="unverified">'+records.products.filter(source=>source.status==='unverified').length+'<'));
    assert(html.includes(encode(verified.sourceUrl)));
    assert(html.includes(encode(unverified.reason)));
    assert(html.includes(dollars(verified.priceCents)));
    assert(html.includes(dollars(product.priceCents)));
    assert(html.includes(dollars(sale)));
    assert(html.includes('/admin/products/'+verified.id));
    for(const variant of product.variants)assert(html.includes('data-price-variant-id="'+variant.id+'" data-price-variant-state="'+(variant.active?'active':'retired')+'"'));
    if(retired){
     assert(html.includes('data-price-variant-id="'+retired.id+'" data-price-variant-state="retired"'));
     assert(html.includes('Their stored prices are retained for historical reference.'));
     assert(html.includes(dollars(retired.priceCents)));
    }
   }
  });
 }finally{
  await db.user.deleteMany({where:{id:{in:userIds}}});
  await db.$disconnect();
 }
});
