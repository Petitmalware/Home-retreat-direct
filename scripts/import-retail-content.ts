import 'dotenv/config';
import fs from 'node:fs';
import {db} from '../lib/db';
import content from '../data/retail-content.json';
import {sourcedGalleries} from '../lib/gallery-provenance';
async function main(){
 const marker='.local/retail-content-imported.json',version=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')).version??1:0;if(version>=2)return;
 const policies=await db.policy.findMany();fs.mkdirSync('.local/backups',{recursive:true});fs.writeFileSync('.local/backups/policies-before-retail-'+Date.now()+'.json',JSON.stringify(policies,null,2),{mode:0o600});
 // Finished customer copy is supplied locally. Business approval and opening
 // controls remain separate, so this does not authorize a public sales launch.
 for(const[slug,body]of Object.entries(content).filter(([slug])=>version===0||['about','faqs','accessibility','contact'].includes(slug)))await db.policy.updateMany({where:{slug},data:{body,version:'retail-1'}});
 for(const category of new Set(sourcedGalleries.map(p=>p.category)))for(const p of sourcedGalleries.filter(p=>p.category===category).slice(0,2))await db.product.updateMany({where:{id:p.id},data:{bestSeller:true}});
 await db.collection.updateMany({where:{slug:'best-sellers'},data:{name:'Our Favorites',description:'A selection of pieces chosen for everyday comfort, useful features and considered design.'}});
 fs.writeFileSync(marker,JSON.stringify({version:2,completedAt:new Date().toISOString()}),{mode:0o600});console.log('Customer policy copy and editorial collections updated.');
}
main().finally(()=>db.$disconnect());
