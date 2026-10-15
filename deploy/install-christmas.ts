import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import catalog from '../data/christmas-catalog.json';
import {christmasCategories} from '../lib/seasonal';
import {productVideoUrl} from '../lib/product-video';
import {galleryReady} from '../lib/product-gallery';
function check(){
 const hashes=new Set<string>(),ids=new Set<string>();
 if(catalog.products.length!==30)throw new Error('Expected the curated 30-product Christmas range.');
 for(const p of catalog.products){
  if(ids.has(p.id)||!christmasCategories.some(c=>c.slug===p.category)||!Number.isSafeInteger(p.priceCents)||p.priceCents<1||p.images.length<6||!galleryReady(p.images))throw new Error('Invalid seasonal product: '+p.id);
  ids.add(p.id);
  if(p.videoUrl&&!productVideoUrl(p.videoUrl))throw new Error('Unsupported seasonal video.');
  for(const image of p.images){const file=path.resolve('public','.'+image.url);if(!file.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(file))throw new Error('Missing seasonal image.');const checksum=createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(checksum!==image.sha256||hashes.has(checksum))throw new Error('Damaged or reused seasonal image.');hashes.add(checksum);}
 }
 return {products:ids.size,images:hashes.size,videos:catalog.products.filter(p=>p.videoUrl).length};
}
async function main(){
 const totals=check();
 if(process.argv.includes('--check')){console.log(JSON.stringify({ok:true,databaseTouched:false,...totals}));return;}
 const {db}=await import('../lib/db');
 try{const {installChristmasCatalog}=await import('../lib/install-christmas');console.log(JSON.stringify({ok:true,...await installChristmasCatalog(db)}));}finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Seasonal catalog installation failed.');process.exitCode=1;});
