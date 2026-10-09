import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {db} from '../lib/db';
import {sourcedGalleries} from '../lib/gallery-provenance';
import {galleryReady} from '../lib/product-gallery';

async function main(){
 if(!sourcedGalleries.length)throw new Error('There are no verified product galleries to import.');
 const marker=path.resolve('.local/product-galleries-imported.json');
 if(fs.existsSync(marker)){console.log('Verified galleries already imported. Owner edits preserved.');return;}
 const photographs=sourcedGalleries.flatMap(p=>p.images);
 if(new Set(photographs.map(i=>i.sha256)).size!==photographs.length)throw new Error('A photograph is reused between gallery entries.');
 for(const p of sourcedGalleries){
  if(!galleryReady(p.images))throw new Error('Four distinct photographs are required for '+p.id);
  for(const image of p.images)if(!fs.existsSync(path.join(process.cwd(),'public',image.url)))throw new Error('Missing local photograph '+image.url);
 }
 const originals=await db.product.findMany({where:{OR:[{id:{startsWith:'prd-'}},{id:{in:sourcedGalleries.map(p=>p.id)}}]},include:{images:true,variants:{include:{inventory:true}},specifications:true,categories:true,collections:true,reviews:{include:{images:true}}}});
 const affected=originals.map(p=>p.id);
 if(await db.orderItem.count({where:{productId:{in:affected}}}))throw new Error('Existing orders reference catalog identities. Import needs a reviewed mapping.');
 const directory=path.resolve('.local/backups');fs.mkdirSync(directory,{recursive:true});
 const backup=path.join(directory,'catalog-before-real-galleries-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 fs.writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),products:originals},null,2),{flag:'wx',mode:0o600});
 await db.$transaction(async tx=>{
  // Keep unresolved fictional records available to the owner as drafts. They
  // must not keep displaying category-wide placeholders in the storefront.
  await tx.product.updateMany({where:{id:{startsWith:'prd-'},isDemo:true},data:{status:'DRAFT'}});
  for(const entry of sourcedGalleries){
   const data={name:entry.name,brand:entry.brand,model:entry.model,slug:entry.slug,sku:'ABO-'+entry.asin,description:entry.description,shortDescription:entry.description.slice(0,500),priceCents:0,compareAtCents:null,costCents:null,status:'DRAFT',isDemo:false,stockStatus:'Out of Stock',material:entry.material,dimensions:entry.dimensions,weight:entry.weight,shippingWeight:'Packaging weight awaiting confirmation',warranty:'Warranty coverage awaiting confirmation',deliveryType:'Curbside Freight',deliveryWindow:'Availability and delivery service awaiting confirmation',assembly:'Use the instructions for the exact model.',care:'Follow the manufacturer care instructions for this material.',features:entry.features,included:entry.included,seoTitle:entry.name,seoDescription:entry.description.slice(0,300),demoRating:null,demoCount:null,videoUrl:null};
   await tx.product.upsert({where:{id:entry.id},create:{id:entry.id,...data},update:data});
   await tx.productImage.deleteMany({where:{productId:entry.id}});
   for(const [position,image] of entry.images.entries())await tx.productImage.create({data:{productId:entry.id,url:image.url,alt:image.alt,kind:'PRODUCT',position,isPrimary:position===0}});
   await tx.productSpecification.deleteMany({where:{productId:entry.id}});
   for(const [position,spec] of entry.specifications.entries())await tx.productSpecification.create({data:{productId:entry.id,...spec,position}});
   const variants=await tx.productVariant.findMany({where:{productId:entry.id}});
   if(variants.length){
    // Existing IDs preserve saved product references. Unverified fictional
    // finishes have no inventory and cannot be ordered while the model is draft.
    for(const [index,variant] of variants.entries()){await tx.productVariant.update({where:{id:variant.id},data:{name:index===0?entry.color:'Finish awaiting confirmation',color:index===0?entry.color:'Unconfirmed',colorHex:index===0?entry.colorHex:'#d8d8d8',size:entry.model,priceCents:0}});await tx.inventory.upsert({where:{variantId:variant.id},create:{variantId:variant.id,quantity:0,trackingEnabled:false},update:{quantity:0,reserved:0,trackingEnabled:false}});}
    await tx.productVariant.deleteMany({where:{productId:entry.id,id:{not:variants[0].id},cartItems:{none:{}},orderItems:{none:{}}}});
   }else await tx.productVariant.create({data:{productId:entry.id,sku:'ABO-'+entry.asin+'-PHOTO',name:entry.color,color:entry.color,colorHex:entry.colorHex,size:entry.model,priceCents:0,inventory:{create:{quantity:0,trackingEnabled:false}}}});
   await tx.productCategory.deleteMany({where:{productId:entry.id}});await tx.productCategory.create({data:{productId:entry.id,categoryId:entry.category}});
   await tx.review.deleteMany({where:{productId:entry.id,isDemo:true}});
  }
 },{timeout:120000});
 fs.writeFileSync(marker,JSON.stringify({version:1,products:sourcedGalleries.map(p=>p.id),images:photographs.length,completedAt:new Date().toISOString(),backup}),{mode:0o600});
 console.log('Imported '+sourcedGalleries.length+' real model galleries with '+photographs.length+' distinct photographs. Unresolved fictional products remain owner-visible drafts.');
}
main().finally(()=>db.$disconnect());
