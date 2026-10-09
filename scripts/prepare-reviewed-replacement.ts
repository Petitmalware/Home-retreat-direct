import 'dotenv/config';import fs from 'node:fs';import {createHash} from 'node:crypto';import {db} from '../lib/db';import {sourcedGalleries} from '../lib/gallery-provenance';
async function main(){
 const id='prd-premium-furniture-16',entry=sourcedGalleries.find(p=>p.id===id);
 if(entry?.asin!=='B07HZ1LZW7')throw Error('Expected reviewed Bagley replacement');
 const old=await db.product.findUniqueOrThrow({where:{id},include:{images:true,variants:true,specifications:true}});
 if(old.model==='K51400AC'){
  if(!old.slug.includes('leila')){console.log('Reviewed replacement is already current.');return;}
  if(await db.orderItem.count({where:{productId:id}})||await db.adminAuditLog.count({where:{entityId:id}}))throw Error('Historical references or owner edits prevent updating this identity.');
  fs.writeFileSync('.local/backups/replacement-identity-before-cleanup-'+Date.now()+'.json',JSON.stringify(old,null,2),{mode:0o600});
  const sku='HRD-B07HZ1LZW7',slug='stone-beam-bagley-armless-sectional-chair-stone-k51400ac';
  await db.$transaction(async tx=>{await tx.product.update({where:{id},data:{sku,slug}});for(const variant of old.variants)await tx.productVariant.update({where:{id:variant.id},data:{sku:sku+'-STANDARD'}});});
  const manifestFile='data/product-galleries.json',manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const source=manifest.products.find((p:{id:string})=>p.id===id);source.sku=sku;source.slug=slug;
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  const markerFile='.local/retail-catalog-imported.json',marker=JSON.parse(fs.readFileSync(markerFile,'utf8'));marker.products[id]=createHash('sha256').update(JSON.stringify(source)).digest('hex');fs.writeFileSync(markerFile,JSON.stringify(marker,null,2),{mode:0o600});
  console.log('Reviewed replacement now has its own Bagley URL and store SKU.');return;
 }
 if(old.model!=='L18300OTTOBADLASADD'||await db.orderItem.count({where:{productId:id}})||await db.adminAuditLog.count({where:{entityId:id}}))throw Error('Historical references or owner edits prevent replacing this model.');
 fs.writeFileSync('.local/backups/unused-model-before-replacement-'+Date.now()+'.json',JSON.stringify(old,null,2),{mode:0o600});
 const file='.local/retail-catalog-imported.json',marker=JSON.parse(fs.readFileSync(file,'utf8'));delete marker.products[id];fs.writeFileSync(file,JSON.stringify(marker,null,2),{mode:0o600});
 console.log('Prepared replacement of an unused unedited model; private backup retained.');
}
main().finally(()=>db.$disconnect());
