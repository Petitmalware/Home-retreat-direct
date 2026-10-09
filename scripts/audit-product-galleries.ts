import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {db} from '../lib/db';
import {sourcedGalleryIds} from '../lib/gallery-provenance';
import {galleryReady} from '../lib/product-gallery';
import {categories} from '../lib/catalog';
async function main(){
 const rows=await db.product.findMany({include:{images:{orderBy:{position:'asc'}},categories:true},orderBy:{id:'asc'}}),seen=new Map<string,string>(),missing:string[]=[],duplicates:{product:string;other:string;image:string}[]=[];
 const verified=rows.filter(p=>p.status==='ACTIVE'&&!p.isDemo);
 for(const p of verified){
  if(!galleryReady(p.images))missing.push(p.id);
  for(const image of p.images){const localPath=image.url.startsWith('/images/')?path.join(process.cwd(),'public',image.url):image.url.startsWith('/api/media/')?path.join(process.cwd(),'.local/media',image.url.split('/').at(-1)!):null;if(!localPath||!fs.existsSync(localPath)){missing.push(image.url);continue;}const checksum=createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');if(seen.has(checksum))duplicates.push({product:p.id,other:seen.get(checksum)!,image:image.url});else seen.set(checksum,p.id);}
 }
 const originalIds=new Set(categories.flatMap(category=>Array.from({length:category.count},(_,i)=>'prd-'+category.slug+'-'+(i+1))));
 const completedOriginalProducts=verified.filter(p=>originalIds.has(p.id)).length;
 const unresolved=rows.filter(p=>originalIds.has(p.id)&&(!sourcedGalleryIds.includes(p.id)||p.status!=='ACTIVE'||p.isDemo));
 const categoryCounts=Object.fromEntries(categories.map(c=>[c.slug,verified.filter(p=>p.categories.some(pc=>pc.categoryId===c.slug)).length]));
 const emptyCategories=categories.filter(c=>!categoryCounts[c.slug]).map(c=>c.slug),unpriced=verified.filter(p=>p.priceCents<=0).map(p=>p.id),unexpectedDrafts=rows.filter(p=>sourcedGalleryIds.includes(p.id)&&p.status!=='ACTIVE').map(p=>p.id);
 const result={checkedAt:new Date().toISOString(),totalRecords:rows.length,activeProducts:verified.length,completedOriginalProducts,completedPhotographs:seen.size,minimumPhotosPerCompletedProduct:Math.min(...verified.map(p=>p.images.length)),categoryCounts,emptyCategories,unpricedProducts:unpriced,unexpectedDrafts,duplicatePhotographs:duplicates,missingPhotographs:missing,remainingOriginalProducts:unresolved.length,remainingByCategory:unresolved.reduce((counts:Record<string,number>,p)=>{for(const c of p.categories)counts[c.categoryId]=(counts[c.categoryId]??0)+1;return counts;},{}),priceRangeUSD:{minimum:Math.min(...verified.map(p=>p.priceCents))/100,maximum:Math.max(...verified.map(p=>p.priceCents))/100},unresolvedProducts:unresolved.map(p=>({id:p.id,name:p.name,status:p.status}))};
 console.log(JSON.stringify(result,null,2));if(missing.length||duplicates.length||emptyCategories.length||unpriced.length||unexpectedDrafts.length||unresolved.length)process.exitCode=1;
}
main().finally(()=>db.$disconnect());
