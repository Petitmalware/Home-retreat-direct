import {db} from './db';
import type {Prisma} from '@/generated/prisma/client';
import {CHRISTMAS_SETTING,CHRISTMAS_COLLECTION,christmasCategorySlugs,parseSeason,seasonActive} from './seasonal';
type Reader=Pick<Prisma.TransactionClient,'siteSetting'>;
export async function readChristmasSeason(reader:Reader=db,now=new Date()){
 const row=await reader.siteSetting.findUnique({where:{key:CHRISTMAS_SETTING}});
 const settings=parseSeason(row?.value);
 return {...settings,active:seasonActive(settings,now)};
}
export function visibleProductWhere(christmasActive:boolean):Prisma.ProductWhereInput{
 return {status:'ACTIVE',isDemo:false,...(!christmasActive?{AND:[{collections:{none:{collection:{slug:CHRISTMAS_COLLECTION}}}},{categories:{none:{category:{OR:[{group:'Christmas'},{slug:{in:christmasCategorySlugs}}]}}}}]}:{})};
}
