import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {db} from '../lib/db';
import {sourcedGalleries} from '../lib/gallery-provenance';
import {galleryReady} from '../lib/product-gallery';

async function main(){
 const marker=path.resolve('.local/retail-catalog-imported.json');
 const imported:Record<string,string>=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')).products:{};
 const pending=sourcedGalleries.filter(p=>!imported[p.id]);
 await db.productImage.updateMany({where:{productId:{in:sourcedGalleries.map(p=>p.id)},kind:{notIn:['PRODUCT','LIFESTYLE','DIMENSIONS']}},data:{kind:'PRODUCT'}});
 if(!pending.length){console.log('Retail catalog is current. Owner prices, discounts and gallery edits preserved.');return;}
 const hashes=new Set<string>();
 for(const p of sourcedGalleries){
  if(!galleryReady(p.images)||!p.priceCents||p.priceCents<1)throw new Error('A priced four-photo gallery is required for '+p.id);
  for(const i of p.images){const file=path.join(process.cwd(),'public',i.url);if(!fs.existsSync(file))throw new Error('Missing photograph '+i.url);const checksum=createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(checksum!==i.sha256||hashes.has(checksum))throw new Error('Invalid or repeated photo '+i.url);hashes.add(checksum);}
 }
 const existing=await db.product.findMany({include:{images:true,variants:{include:{inventory:true}},specifications:true,categories:true,collections:true}});
 for(const entry of pending){const old=existing.find(p=>p.id===entry.id);if(old&&old.model!==entry.model&&await db.orderItem.count({where:{productId:entry.id}}))throw new Error('Historical orders prevent replacing identity '+entry.id);}
 const directory=path.resolve('.local/backups');fs.mkdirSync(directory,{recursive:true});const backup=path.join(directory,'catalog-before-retail-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');fs.writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),products:existing},null,2),{flag:'wx',mode:0o600});
 await db.$transaction(async tx=>{
  for(const entry of pending){
   const sku=entry.sku??'HRD-'+entry.asin;
   const fields={sku,slug:entry.slug,name:entry.name,description:entry.description,shortDescription:entry.description.slice(0,500),priceCents:entry.priceCents!,discountPercent:entry.discountPercent??0,compareAtCents:null,costCents:null,brand:entry.brand,model:entry.model,status:'ACTIVE',isDemo:false,stockStatus:entry.stockStatus??'Special Order',material:entry.material,dimensions:entry.dimensions,weight:entry.weight,shippingWeight:entry.shippingWeight??'',warranty:entry.warranty??'Manufacturer warranty terms apply where provided. Coverage excludes normal wear, misuse and improper installation.',deliveryType:entry.deliveryType??'Curbside Freight',deliveryWindow:entry.deliveryWindow??'Delivery timing and charges are confirmed with your order before payment.',assembly:entry.assembly??'Follow the supplied installation instructions.',care:entry.care??'Follow the product care instructions and avoid abrasive cleaners.',features:entry.features,included:entry.included,seoTitle:entry.name,seoDescription:entry.description.slice(0,300),demoRating:null,demoCount:null};
   const firstInCategory=sourcedGalleries.filter(p=>p.category===entry.category).indexOf(entry);
   await tx.product.upsert({where:{id:entry.id},create:{id:entry.id,...fields,featured:firstInCategory<2,bestSeller:firstInCategory<2,newArrival:firstInCategory<3},update:{...fields,featured:firstInCategory<2,bestSeller:firstInCategory<2,newArrival:firstInCategory<3}});
   await tx.productImage.deleteMany({where:{productId:entry.id}});
   for(const[position,image]of entry.images.entries())await tx.productImage.create({data:{productId:entry.id,url:image.url,alt:image.alt,kind:image.kind??'PRODUCT',position,isPrimary:position===0}});
   await tx.productSpecification.deleteMany({where:{productId:entry.id}});
   for(const[position,spec]of entry.specifications.entries())await tx.productSpecification.create({data:{productId:entry.id,...spec,position}});
   const variants=await tx.productVariant.findMany({where:{productId:entry.id},orderBy:{id:'asc'}});
   if(variants.length){const v=variants[0];await tx.productVariant.update({where:{id:v.id},data:{name:entry.color,color:entry.color,colorHex:entry.colorHex,size:entry.model,priceCents:entry.priceCents!}});await tx.inventory.upsert({where:{variantId:v.id},create:{variantId:v.id,quantity:0,trackingEnabled:false},update:{trackingEnabled:false}});await tx.productVariant.deleteMany({where:{productId:entry.id,id:{not:v.id},cartItems:{none:{}},orderItems:{none:{}}}});}else await tx.productVariant.create({data:{productId:entry.id,sku:sku+'-STANDARD',name:entry.color,color:entry.color,colorHex:entry.colorHex,size:entry.model,priceCents:entry.priceCents!,inventory:{create:{quantity:0,trackingEnabled:false}}}});
   await tx.productCategory.deleteMany({where:{productId:entry.id}});await tx.productCategory.create({data:{productId:entry.id,categoryId:entry.category}});
   await tx.productCollection.deleteMany({where:{productId:entry.id}});
   const collectionIds=entry.category==='saunas'?['wellness']:entry.category==='massage-chairs'?['wellness','home-comfort']:['gazebos','patio-furniture','fire-pits'].includes(entry.category)?['outdoor-living']:['home-comfort'];
   for(const collectionId of collectionIds)if(await tx.collection.findUnique({where:{id:collectionId}}))await tx.productCollection.create({data:{productId:entry.id,collectionId}});
   await tx.review.deleteMany({where:{productId:entry.id,isDemo:true}});
  }
  // Photography for category navigation now comes from a model in that collection.
  for(const category of new Set(sourcedGalleries.map(p=>p.category))){const first=sourcedGalleries.find(p=>p.category===category)!;await tx.category.update({where:{id:category},data:{image:first.images[0].url}});}
 },{timeout:120000});
 for(const p of pending)imported[p.id]=createHash('sha256').update(JSON.stringify(p)).digest('hex');
 fs.writeFileSync(marker,JSON.stringify({version:1,completedAt:new Date().toISOString(),products:imported,backup},null,2),{mode:0o600});
 console.log('Imported '+pending.length+' priced products with complete individual galleries.');
}
main().finally(()=>db.$disconnect());
