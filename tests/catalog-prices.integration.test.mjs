import 'dotenv/config';
import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../lib/db.ts';
import {products} from '../lib/products.ts';
import {sellingPriceCents} from '../lib/pricing.ts';

test('catalog regular and sale prices match exact model and finish evidence',{skip:process.env.RUN_INTEGRATION!=='true',timeout:90000},async()=>{
 const audit=JSON.parse(fs.readFileSync('data/price-sources.json','utf8'));
 const manifest=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8')).products;
 const rows=await db.product.findMany({where:{id:{in:manifest.map(p=>p.id)}},include:{variants:true}});
 const normalize=value=>value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
 try{
  const publicRows=await products();
  assert.equal(rows.length,manifest.length);assert.equal(audit.products.length,manifest.length);
  assert.equal(new Set(rows.map(p=>p.priceCents)).size>20,true,'The catalog has varied model prices.');
  for(const entry of manifest){
   const actual=rows.find(p=>p.id===entry.id),source=audit.products.find(p=>p.id===entry.id),exposed=publicRows.find(p=>p.id===entry.id);
   assert(actual&&source&&exposed,entry.id);assert.equal(actual.discountPercent,audit.discountPercent);
   assert.equal(actual.priceCents,entry.priceCents);assert.equal(exposed.price,sellingPriceCents(actual.priceCents,audit.discountPercent)/100);
   assert.equal(exposed.compareAt,actual.priceCents/100);
   assert.equal(exposed.variants.length,actual.variants.filter(v=>v.active).length);
   if(source.status==='verified'){assert.equal(actual.priceCents,source.priceCents,entry.id);assert.equal(source.currency,'USD');assert(source.sourceUrl.startsWith('https://'));}
   else assert(entry.pricingBasis.includes('unverified'));
   for(const variant of actual.variants.filter(v=>v.active)){
    const shown=exposed.variants.find(v=>v.id===variant.id);assert(shown);
    assert.equal(shown.price,sellingPriceCents(variant.priceCents,audit.discountPercent)/100);
    assert.equal(shown.compareAt,variant.priceCents/100);
    if(source.status==='verified'){
     const quote=source.variants?.find(quote=>normalize(quote.color??'')===normalize(variant.color));
     const standard=source.variants?.length===1?source.variants[0]:undefined;
     assert.equal(variant.priceCents,quote?.priceCents??standard?.priceCents??source.priceCents,entry.id+' / '+variant.color);
    }
   }
  }
  const origin=process.env.APP_ORIGIN??'http://localhost:3000',first=manifest.find(p=>p.id==='prd-massage-chairs-3');
  const response=await fetch(origin+'/products/'+first.slug);assert.equal(response.status,200);
  const html=await response.text();assert(html.replace(/<!--.*?-->/g,'').includes('15% off'));assert(!html.includes('Current exact-model price could not be verified.'));
 }finally{await db.$disconnect();}
});
