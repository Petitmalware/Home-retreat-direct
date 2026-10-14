import type {Prisma} from '@/generated/prisma/client';
import {readChristmasSeason} from './seasonal-store';
import {CHRISTMAS_COLLECTION,christmasCategorySlugs} from './seasonal';
export async function seasonalAdminData(reader:Prisma.TransactionClient){
 const [settings,products]=await Promise.all([readChristmasSeason(reader),reader.product.findMany({where:{OR:[{collections:{some:{collection:{slug:CHRISTMAS_COLLECTION}}}},{categories:{some:{category:{OR:[{group:'Christmas'},{slug:{in:christmasCategorySlugs}}]}}}}]},select:{id:true,name:true,slug:true,priceCents:true,discountPercent:true,videoUrl:true,_count:{select:{images:true}}},orderBy:{name:'asc'}})]);
 return {settings,products};
}
