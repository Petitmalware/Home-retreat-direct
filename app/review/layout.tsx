import type {Metadata} from 'next';
import {storeConfig} from '@/lib/store-config';

export async function generateMetadata():Promise<Metadata>{const config=await storeConfig();return {title:'Share Your Experience',description:`Use your secure ${config.storeName} review invitation to share your experience with a delivered product.`,alternates:{canonical:null},robots:{index:false,follow:false}};}
export default function Layout({children}:{children:React.ReactNode}){return children;}
