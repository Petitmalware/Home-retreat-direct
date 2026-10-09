import 'dotenv/config';import fs from 'node:fs';import path from 'node:path';import {db} from '../lib/db';import {sourcedGalleries,type SourcedGallery} from '../lib/gallery-provenance';
async function main(){
 const file=process.argv[2]??fs.readdirSync('.local').filter(f=>f.startsWith('manifest-before-enrich-')).sort().at(-1);if(!file)throw new Error('Supply the pre-refinement manifest.');
 const before=JSON.parse(fs.readFileSync(file.includes('/')||file.includes('\\')?file:path.join('.local',file),'utf8')).products as SourcedGallery[];
 const rows=await db.product.findMany({where:{id:{in:before.map(p=>p.id)}},include:{images:{orderBy:{position:'asc'}},variants:{include:{inventory:true}},specifications:{orderBy:{position:'asc'}}}});
 const backup='.local/backups/catalog-before-refinement-'+Date.now()+'.json';fs.writeFileSync(backup,JSON.stringify(rows,null,2),{mode:0o600});let changed=0,preserved=0;
 await db.$transaction(async tx=>{for(const old of before){const entry=sourcedGalleries.find(p=>p.id===old.id),actual=rows.find(p=>p.id===old.id);if(!entry||!actual||entry.brand!==old.brand||entry.model!==old.model)continue;
  const fields=['description','material','dimensions','weight','shippingWeight','features','included','assembly','care','warranty','deliveryType','deliveryWindow'] as const;const data:Record<string,unknown>={};
  for(const key of fields){const next=entry[key]??'',previous=old[key]??'';if(JSON.stringify(next)===JSON.stringify(previous))continue;if(JSON.stringify(actual[key])===JSON.stringify(previous))data[key]=next;else preserved++;}
  if(Object.keys(data).length){if(data.description&&actual.shortDescription===old.description.slice(0,500))data.shortDescription=entry.description.slice(0,500);await tx.product.update({where:{id:entry.id},data});changed++;}
  if(JSON.stringify(actual.specifications.map(s=>({label:s.label,value:s.value})))===JSON.stringify(old.specifications)&&JSON.stringify(old.specifications)!==JSON.stringify(entry.specifications)){await tx.productSpecification.deleteMany({where:{productId:entry.id}});for(const[position,s]of entry.specifications.entries())await tx.productSpecification.create({data:{productId:entry.id,...s,position}});}
  const oldImages=old.images.map(i=>({url:i.url,alt:i.alt,kind:i.kind})),actualImages=actual.images.map(i=>({url:i.url,alt:i.alt,kind:i.kind}));
  if(JSON.stringify(oldImages)===JSON.stringify(actualImages)&&JSON.stringify(old.images)!==JSON.stringify(entry.images)){await tx.productImage.deleteMany({where:{productId:entry.id}});for(const[position,i]of entry.images.entries())await tx.productImage.create({data:{productId:entry.id,url:i.url,alt:i.alt,kind:i.kind,position,isPrimary:position===0}});}
  const first=actual.variants[0];if(first&&(first.color===old.color||first.name===old.color)&&entry.color!==old.color)await tx.productVariant.update({where:{id:first.id},data:{name:entry.color,color:entry.color,colorHex:entry.colorHex}});
 }} ,{timeout:120000});
 console.log('Refined source facts for '+changed+' products; '+preserved+' owner-edited fields preserved. Backup saved.');
}
main().finally(()=>db.$disconnect());
