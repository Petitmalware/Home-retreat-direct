import {storeConfig} from '@/lib/store-config';
import {Home} from '@/components/store/home';import {products} from '@/lib/products';import {db} from '@/lib/db';export const dynamic='force-dynamic';
export default async function Page(){const list=await products(),review=await db.review.findFirst({where:{status:'APPROVED',isDemo:false,product:{status:'ACTIVE',isDemo:false}},select:{title:true,body:true,name:true}});const config=await storeConfig();return <Home categories={config.categories} heroImage={config.homepageBanner} featured={list.filter(p=>p.featured)} best={list.filter(p=>p.bestSeller)} demoReviews={process.env.SHOW_DEMO_REVIEWS==='true'&&process.env.DEVELOPMENT_CATALOG==='true'} review={review??undefined}/>}

