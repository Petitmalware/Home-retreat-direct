import {db} from '@/lib/db';import {readStoreReadiness} from '@/lib/store-readiness';
export const dynamic='force-dynamic';
import {Checkout} from '@/components/store/checkout';import {pageMetadata} from '@/lib/seo';import {storeConfig} from '@/lib/store-config';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Submit Your Order',description:`Review your ${config.storeName} order and provide contact and delivery details for the order team.`,path:'/checkout',index:false,siteName:config.storeName,image:config.homepageBanner});}
export default async function Page(){const config=await storeConfig(),orderingAvailable=process.env.DEVELOPMENT_CATALOG==='true'||(await readStoreReadiness(db)).acceptingOrders;return <Checkout orderingAvailable={orderingAvailable} supportEmail={config.supportEmail}/>}
