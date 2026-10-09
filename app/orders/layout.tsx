import type {Metadata} from 'next';
import {storeConfig} from '@/lib/store-config';

export async function generateMetadata():Promise<Metadata>{const config=await storeConfig();return {title:'Your Order',description:`Secure access to your ${config.storeName} order details, delivery information and order progress.`,alternates:{canonical:null},robots:{index:false,follow:false}};}
export default function Layout({children}:{children:React.ReactNode}){return children;}
