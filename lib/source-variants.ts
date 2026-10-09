import type {Prisma} from '@/generated/prisma/client';
import type {SourcedGallery} from './gallery-provenance';
/** Populate documented finishes without asserting any warehouse quantities. */
export async function syncSourceVariants(tx:Prisma.TransactionClient,entry:SourcedGallery){
 if(!entry.variants?.length)return;
 const existing=await tx.productVariant.findMany({where:{productId:entry.id}});
 const primary=existing.find(v=>v.color===entry.color)??existing[0];
 for(const source of entry.variants){
  const old=existing.find(v=>v.color===source.color)??(source.color===entry.color?primary:undefined);
  const fields={name:source.name,color:source.color,colorHex:source.colorHex,size:entry.model,priceCents:source.priceCents};
  const saved=old?await tx.productVariant.update({where:{id:old.id},data:fields}):await tx.productVariant.create({data:{productId:entry.id,sku:entry.sku+'-'+source.color.toUpperCase().replace(/[^A-Z0-9]+/g,'-'),...fields}});
  await tx.inventory.upsert({where:{variantId:saved.id},create:{variantId:saved.id,quantity:0,trackingEnabled:false},update:{trackingEnabled:false}});
  for(const image of entry.images.filter(i=>i.color===source.color))await tx.productImage.updateMany({where:{productId:entry.id,url:image.url},data:{variantId:saved.id}});
 }
 const colors=entry.variants.map(v=>v.color);
 await tx.productVariant.deleteMany({where:{productId:entry.id,color:{notIn:colors},cartItems:{none:{}},orderItems:{none:{}}}});
}
