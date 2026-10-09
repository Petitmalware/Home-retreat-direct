import {Listing} from '@/components/store/listing';import {products} from '@/lib/products';
import {pageMetadata} from '@/lib/seo';
import {storeConfig} from '@/lib/store-config';
export const dynamic='force-dynamic';
export async function generateMetadata(){const config=await storeConfig();return pageMetadata({title:'Search Products',description:`Search ${config.storeName} products by name, feature or size and compare the pieces that fit your home.`,path:'/search',index:false,siteName:config.storeName,image:config.homepageBanner});}
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){const{q=''}=await searchParams;return <Listing products={await products()} title="Find your retreat." intro="A room, a ritual, a little more comfort. Find the piece you have in mind." query={q}/>}

