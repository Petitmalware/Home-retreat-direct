import {TrackOrder} from '@/components/store/tracking';import {pageMetadata} from '@/lib/seo';import {storeConfig} from '@/lib/store-config';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Track Your Order',description:`Track your ${config.storeName} order using its order number and the email address supplied at checkout.`,path:'/track-order',index:false,siteName:config.storeName,image:config.homepageBanner});}
export default function Page(){return <TrackOrder/>}
