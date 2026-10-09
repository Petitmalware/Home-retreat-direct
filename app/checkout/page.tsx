import {Checkout} from '@/components/store/checkout';import {pageMetadata} from '@/lib/seo';import {storeConfig} from '@/lib/store-config';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Submit Your Order',description:`Review your ${config.storeName} order and provide contact and delivery details for the order team.`,path:'/checkout',index:false,siteName:config.storeName,image:config.homepageBanner});}
export default function Page(){return <Checkout/>}
