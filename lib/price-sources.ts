import 'server-only';
import sources from '@/data/price-sources.json';
import christmas from '@/data/christmas-catalog.json';
import {staff} from './security';
import {db} from './db';

type SourceVariant={sku?:string;supplierSku?:string;color?:string;priceCents:number};
export type PriceSource={
 id:string;name:string;brand:string;model:string;category:string;
 status:'verified'|'unverified';currency:'USD';priceCents?:number|null;
 sourceUrl?:string;checkedAt?:string;reason?:string;note?:string;
 priceType?:string;variants?:SourceVariant[];
};
type PriceSourceRecords={version:number;checkedAt:string;discountPercent:number;products:PriceSource[]};

export async function staffPriceSources(){
 await staff('products');
 const records:PriceSourceRecords={...sources,checkedAt:christmas.checkedAt>sources.checkedAt?christmas.checkedAt:sources.checkedAt,products:[...sources.products as PriceSource[],...christmas.products.map(product=>({id:product.id,name:product.name,brand:product.brand,model:product.model,category:product.category,status:'verified' as const,currency:'USD' as const,priceCents:product.sourcePriceCents,sourceUrl:product.source,checkedAt:product.checkedAt,priceType:'Selected variant selling price',note:'Selected option: '+product.selectedSize+'. Home Retreat Direct applies its own 15% discount to this source-based regular price.'}))]};
 const products=await db.product.findMany({
  where:{id:{in:records.products.map(source=>source.id)}},
  select:{id:true,slug:true,sku:true,priceCents:true,discountPercent:true,variants:{select:{id:true,sku:true,name:true,color:true,size:true,priceCents:true,active:true},orderBy:{sku:'asc'}}},
 });
 return {records,products};
}
