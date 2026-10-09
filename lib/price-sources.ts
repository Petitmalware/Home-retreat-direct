import 'server-only';
import sources from '@/data/price-sources.json';
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
 const records=sources as PriceSourceRecords;
 const products=await db.product.findMany({
  where:{id:{in:records.products.map(source=>source.id)}},
  select:{id:true,slug:true,sku:true,priceCents:true,discountPercent:true,variants:{select:{id:true,sku:true,name:true,color:true,size:true,priceCents:true,active:true},orderBy:{sku:'asc'}}},
 });
 return {records,products};
}
