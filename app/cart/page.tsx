import {Cart} from '@/components/store/cart';import {pageMetadata} from '@/lib/seo';import {storeConfig} from '@/lib/store-config';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Your Shopping Bag',description:`Review the products, quantities and prices in your ${config.storeName} shopping bag before submitting your order.`,path:'/cart',index:false,siteName:config.storeName,image:config.homepageBanner});}
export default function Page(){return <Cart/>}
