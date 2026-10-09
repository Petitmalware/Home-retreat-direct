import {pageMetadata} from '@/lib/seo';
import {storeConfig} from '@/lib/store-config';

export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Store Administration',description:`Authorized staff tools for managing ${config.storeName} products, orders and store settings.`,path:'/admin',index:false,follow:false,siteName:config.storeName,image:config.homepageBanner});}
export default function Layout({children}:{children:React.ReactNode}){return children;}
