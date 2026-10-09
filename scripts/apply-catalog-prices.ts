import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {db} from '../lib/db';
import {sellingPriceCents} from '../lib/pricing';
import type {SourcedGallery} from '../lib/gallery-provenance';

type SourceVariant={sku?:string;supplierSku?:string;color?:string;priceCents:number};
type PriceSource={id:string;model:string;status:string;currency:string;priceCents?:number|null;sourceUrl?:string;checkedAt?:string;variants?:SourceVariant[]};
const normalize=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main(){
 const manifestPath=path.resolve('data/product-galleries.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')) as {products:SourcedGallery[]};
 const audit=JSON.parse(fs.readFileSync('data/price-sources.json','utf8')) as {discountPercent:number;products:PriceSource[]};
 sellingPriceCents(100,audit.discountPercent);
 const sources=new Map(audit.products.map(record=>[record.id,record]));
 if(sources.size!==manifest.products.length)throw new Error('Every catalog model requires a pricing record.');
 const rows=await db.product.findMany({where:{id:{in:manifest.products.map(product=>product.id)}},include:{variants:true}});
 if(rows.length!==manifest.products.length)throw new Error('Catalog model count differs from the database.');
 const snapshots=()=>db.order.findMany({orderBy:{id:'asc'},select:{id:true,subtotalCents:true,shippingCents:true,taxCents:true,totalCents:true,items:{orderBy:{id:'asc'},select:{id:true,quantity:true,unitPriceCents:true}}}});
 const orderBefore=fingerprint(await snapshots());
 const changes=manifest.products.map(product=>{
  const source=sources.get(product.id),actual=rows.find(row=>row.id===product.id);
  if(!source||!actual||actual.model!==product.model||actual.brand!==product.brand||source.model!==product.model)throw new Error('Model identity differs for '+product.id);
  const verified=source.status==='verified';
  if(verified&&(source.currency!=='USD'||!Number.isSafeInteger(source.priceCents)||!source.priceCents||source.priceCents<1||!source.sourceUrl?.startsWith('https://')))throw new Error('Invalid exact-model source price for '+product.id);
  const regularCents=verified?source.priceCents!:actual.priceCents;
  sellingPriceCents(regularCents,audit.discountPercent);
  const variants=actual.variants.map(variant=>{
   const quote=source.variants?.find(quote=>normalize(quote.color??'')===normalize(variant.color));
   // A single standard option has no finish-dependent price to interpolate.
   const standard=source.variants?.length===1&&actual.variants.length===1?source.variants[0]:undefined;
   let priceCents=variant.priceCents;
   if(verified){
    if(quote||standard)priceCents=(quote??standard)!.priceCents;
    else if(!source.variants?.length||actual.variants.length===1)priceCents=regularCents;
    else return {id:variant.id,color:variant.color,priceCents:variant.priceCents,active:false};
   }
   sellingPriceCents(priceCents,audit.discountPercent);
   return {id:variant.id,color:variant.color,priceCents,active:variant.active};
  });
  return {product,source,actual,regularCents,variants};
 });
 const directory=path.resolve('.local/backups');fs.mkdirSync(directory,{recursive:true});
 const backup=path.join(directory,'prices-before-market-update-'+Date.now()+'.json');
 fs.writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),manifest,products:rows},null,2),{flag:'wx',mode:0o600});
 await db.$transaction(async tx=>{
  for(const change of changes){
   await tx.product.update({where:{id:change.product.id},data:{priceCents:change.regularCents,discountPercent:audit.discountPercent,compareAtCents:null}});
   for(const variant of change.variants)await tx.productVariant.update({where:{id:variant.id},data:{priceCents:variant.priceCents,active:variant.active}});
  }
 },{timeout:120000});
 if(fingerprint(await snapshots())!==orderBefore)throw new Error('Order price snapshots changed unexpectedly.');
 for(const change of changes){
  change.product.priceCents=change.regularCents;change.product.discountPercent=audit.discountPercent;
  change.product.pricingBasis=change.source.status==='verified'?'Observed exact-model USD retail selling price; source and check date recorded in staff pricing records':'Home Retreat Direct regular selling price; current external market price unverified';
  for(const variant of change.product.variants??[]){const match=change.variants.find(actual=>normalize(actual.color)===normalize(variant.color));if(match)variant.priceCents=match.priceCents;}
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const summary={checkedAt:new Date().toISOString(),products:changes.length,verifiedMarketPrices:changes.filter(change=>change.source.status==='verified').length,unverifiedMarketPrices:changes.filter(change=>change.source.status!=='verified').length,discountPercent:audit.discountPercent,regularProductPricesChanged:changes.filter(change=>change.regularCents!==change.actual.priceCents).length,regularVariantPricesChanged:changes.flatMap(change=>change.variants.filter(variant=>change.actual.variants.find(actual=>actual.id===variant.id)?.priceCents!==variant.priceCents)).length,retiredUnmatchedVariants:changes.flatMap(change=>change.variants.filter(variant=>!variant.active&&change.actual.variants.find(actual=>actual.id===variant.id)?.active)).length,uniqueRegularPrices:new Set(changes.map(change=>change.regularCents)).size,orderSnapshotsPreserved:true};
 fs.writeFileSync('data/price-update-validation.json',JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary));
}
main().finally(()=>db.$disconnect());
