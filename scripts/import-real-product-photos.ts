import 'dotenv/config';
import fs from 'node:fs';
import {db} from '../lib/db';

// These are real photographed models, kept as archived references with no invented
// retail prices, stock, finish SKUs, delivery promises, or warranty coverage.
type Photo={id:string;name:string;brand:string;model:string;category:string;description:string;material:string;dimensions:string;features:string[];included:string[];image:string;alt:string;source:string;license:string;licenseUrl:string;credit:string;photoSource:string};
const entries=JSON.parse(fs.readFileSync('data/real-product-photos.json','utf8')) as Photo[];
async function main(){
 for(const entry of entries){
  if(await db.product.findUnique({where:{id:entry.id},select:{id:true}}))continue;
  await db.product.create({data:{id:entry.id,sku:'PHOTO-'+entry.id.toUpperCase(),slug:entry.id,name:entry.name,shortDescription:entry.description,description:entry.description,priceCents:0,brand:entry.brand,model:entry.model,status:'ARCHIVED',isDemo:false,stockStatus:'Availability to be confirmed',material:entry.material,dimensions:entry.dimensions,weight:'Confirm exact variant',shippingWeight:'Confirm packaging and variant',warranty:'Confirm coverage before publication',deliveryType:'Confirm delivery service',deliveryWindow:'Confirm availability and delivery',assembly:'Follow the exact model installation manual',care:'Follow the manufacturer care instructions',features:entry.features,included:entry.included,seoTitle:entry.name,seoDescription:entry.description,images:{create:{url:entry.image,alt:entry.alt,position:0,isPrimary:true,kind:'PRODUCT'}},categories:{create:{categoryId:entry.category}},specifications:{create:[{label:'Manufacturer source',value:entry.source,position:0},{label:'Photo source',value:entry.photoSource,position:1},{label:'Photo license',value:entry.license+' '+entry.licenseUrl,position:2},{label:'Photo credit',value:entry.credit,position:3},{label:'Publication status',value:'Draft: confirm sellable SKU, price, stock, delivery and warranty.',position:4}]}}});
 }
 console.log('Imported '+entries.length+' single-photo reference records; existing records preserved. Existing records were preserved.');
}
main().finally(()=>db.$disconnect());
