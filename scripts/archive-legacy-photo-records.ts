import 'dotenv/config';import {db} from '../lib/db';import legacy from '../data/real-product-photos.json';
async function main(){const result=await db.product.updateMany({where:{id:{in:legacy.map(p=>p.id)},status:'DRAFT'},data:{status:'ARCHIVED'}});console.log('Archived '+result.count+' superseded single-photo reference records.');}
main().finally(()=>db.$disconnect());
