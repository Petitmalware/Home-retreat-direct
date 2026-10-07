import {Listing} from '@/components/store/listing';import {products} from '@/lib/products';
export const dynamic='force-dynamic';
export const metadata={title:'Find your retreat'};
export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){const{q=''}=await searchParams;return <Listing products={await products()} title="Find your retreat." intro="A room, a ritual, a little more comfort. Find the piece you have in mind." query={q}/>}

