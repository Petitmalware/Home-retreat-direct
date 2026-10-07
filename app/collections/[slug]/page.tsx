import {db} from '@/lib/db';
import {Listing} from '@/components/store/listing';import {products,filterProducts,collectionTitle} from '@/lib/products';import {categories} from '@/lib/catalog';import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return {title:collectionTitle(slug)??'Collection',description:categories.find(c=>c.slug===slug)?.intro??'Explore considered outdoor living, home comfort and wellness.'}}
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params,category=await db.category.findUnique({where:{slug}}),collection=await db.collection.findUnique({where:{slug}}),title=category?.name??collection?.name??collectionTitle(slug);if(!title)notFound();const list=filterProducts(await products(),slug);return <Listing products={list} title={title} category={slug} intro={category?.description??collection?.description??categories.find(c=>c.slug===slug)?.intro}/>}

