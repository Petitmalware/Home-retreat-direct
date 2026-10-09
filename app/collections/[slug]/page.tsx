import {db} from '@/lib/db';
import {cache} from 'react';
import {pageMetadata} from '@/lib/seo';
import {storeConfig} from '@/lib/store-config';
import {Listing} from '@/components/store/listing';import {products,filterProducts,collectionTitle} from '@/lib/products';import {categories} from '@/lib/catalog';import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
const collectionDetails=cache(async(slug:string)=>{const category=await db.category.findUnique({where:{slug}}),collection=await db.collection.findUnique({where:{slug}}),fallback=categories.find(c=>c.slug===slug),title=category?.name??collection?.name??collectionTitle(slug);if(typeof title!=='string'||!title)notFound();return {title,intro:category?.description??collection?.description??fallback?.intro,image:category?.image??fallback?.image};});
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const{slug}=await params,{title,intro,image}=await collectionDetails(slug),config=await storeConfig();return pageMetadata({title:slug==='all'?'Shop All Products':title,description:`Explore ${title.toLowerCase()}. ${intro?intro+' ':''}Compare product photos, prices, specifications and delivery details.`,path:'/collections/'+slug,image:image??config.homepageBanner,siteName:config.storeName});}
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params,{title,intro}=await collectionDetails(slug);const list=filterProducts(await products(),slug);return <Listing products={list} title={title} category={slug} intro={intro}/>}

