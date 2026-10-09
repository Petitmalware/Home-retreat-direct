import {storeConfig} from '@/lib/store-config';
import {pageMetadata} from '@/lib/seo';
import {Home} from '@/components/store/home';import {products} from '@/lib/products';import {db} from '@/lib/db';export const dynamic='force-dynamic';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Outdoor Living, Home Comfort & Wellness',description:'Explore gazebos, patio furniture, fire pits, electric fireplaces, furniture, massage chairs and saunas. Compare product photos, prices and specifications.',path:'/',image:config.homepageBanner,siteName:config.storeName});}
export default async function Page(){const list=await products(),review=await db.review.findFirst({where:{status:'APPROVED',isDemo:false,product:{status:'ACTIVE',isDemo:false}},select:{title:true,body:true,name:true}});const config=await storeConfig();return <Home categories={config.categories} heroImage={config.homepageBanner} featured={list.filter(p=>p.featured)} best={list.filter(p=>p.bestSeller)} review={review??undefined}/>}

