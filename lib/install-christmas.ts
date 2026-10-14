import type {PrismaClient} from '@/generated/prisma/client';
import catalog from '@/data/christmas-catalog.json';
import {christmasCategories,CHRISTMAS_SETTING} from './seasonal';
/** Add the seasonal range once. Reruns preserve staff edits and display choices. */
export async function installChristmasCatalog(database:PrismaClient){
 return database.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(842036202)`;
  const before=await tx.product.count();
  if(!before)throw new Error('Initialize the existing store before adding the Christmas catalog.');
  const collection=catalog.collection;
  const savedCollection=await tx.collection.upsert({where:{slug:collection.slug},create:collection,update:{}});
  const categoryIds=new Map<string,string>();
  for(const category of christmasCategories){
   const image=catalog.products.find(product=>product.category===category.slug)?.images[0]?.url;
   if(!image)throw new Error('A Christmas category is empty.');
   const saved=await tx.category.upsert({where:{slug:category.slug},create:{id:category.slug,slug:category.slug,name:category.name,group:category.group,description:category.intro,image},update:{}});
   categoryIds.set(category.slug,saved.id);
  }
  let added=0;
  for(const entry of catalog.products){
   if(await tx.product.findUnique({where:{id:entry.id},select:{id:true}}))continue;
   await tx.product.create({data:{
    id:entry.id,sku:entry.sku,slug:entry.slug,name:entry.name,brand:entry.brand,model:entry.model,
    description:entry.description,shortDescription:entry.description,priceCents:entry.priceCents,discountPercent:entry.discountPercent,
    status:'ACTIVE',isDemo:false,featured:entry.model==='CM22059'||entry.model==='CM23510CM23513US',bestSeller:false,newArrival:true,
    stockStatus:entry.stockStatus,material:entry.material,dimensions:entry.dimensions,weight:entry.weight,shippingWeight:entry.shippingWeight,
    deliveryType:entry.deliveryType,deliveryWindow:entry.deliveryWindow,warranty:entry.warranty,assembly:entry.assembly,care:entry.care,
    features:entry.features,included:entry.included,videoUrl:entry.videoUrl??null,seoTitle:entry.name,seoDescription:entry.description,
    categories:{create:{categoryId:categoryIds.get(entry.category)!}},collections:{create:{collectionId:savedCollection.id}},
    images:{create:entry.images.map((image,position)=>({url:image.url,alt:image.alt,kind:image.kind,position,isPrimary:position===0}))},
    specifications:{create:entry.specifications.map((spec,position)=>({...spec,position}))},
    variants:{create:entry.variants.map(variant=>({id:entry.id+'-standard',sku:variant.sku,name:variant.name,color:variant.color,colorHex:variant.colorHex,size:entry.selectedSize,priceCents:variant.priceCents,active:true,inventory:{create:{quantity:0,trackingEnabled:false}}}))},
   }});
   added++;
  }
  await tx.siteSetting.upsert({where:{key:CHRISTMAS_SETTING},create:{key:CHRISTMAS_SETTING,value:JSON.stringify({mode:'on',startsOn:'',endsOn:''})},update:{}});
  await tx.siteSetting.upsert({where:{key:'christmasCatalogVersion'},create:{key:'christmasCatalogVersion',value:String(catalog.version)},update:{value:String(catalog.version)}});
  return {added,existingPreserved:catalog.products.length-added,products:catalog.products.length,images:catalog.products.reduce((sum,p)=>sum+p.images.length,0),videos:catalog.products.filter(p=>p.videoUrl).length};
 },{timeout:60000});
}
