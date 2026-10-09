import {cache} from 'react';
import {product} from '@/lib/products';
import {db} from '@/lib/db';
import {storeConfig} from '@/lib/store-config';
import {pageMetadata,productBreadcrumbSchema,productSchema,serializeJsonLd} from '@/lib/seo';
import {ProductDetail} from '@/components/store/product-detail';
import {notFound} from 'next/navigation';

export const dynamic='force-dynamic';
const getProduct=cache(product);
type Props={params:Promise<{slug:string}>};

export async function generateMetadata({params}:Props){
 const {slug}=await params,p=await getProduct(slug);if(!p)notFound();
 const config=await storeConfig();
 return pageMetadata({title:p.seoTitle||p.name,description:p.seoDescription||p.shortDescription||p.description,path:'/products/'+encodeURIComponent(p.slug),image:p.image,siteName:config.storeName});
}

export default async function Page({params}:Props){
 const {slug}=await params,p=await getProduct(slug);if(!p)notFound();
 const reviews=await db.review.findMany({where:{productId:p.id,status:'APPROVED',isDemo:false},include:{images:true},orderBy:{createdAt:'desc'}});
 return <>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(productBreadcrumbSchema(p))}}/>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(productSchema(p))}}/>
  <ProductDetail product={p} reviews={reviews.map(r=>({id:r.id,rating:r.rating,title:r.title,body:r.body,name:r.name,createdAt:r.createdAt.toISOString(),verifiedPurchase:r.verifiedPurchase,isDemo:r.isDemo,reply:r.reply,helpfulCount:r.helpfulCount,images:r.images.map(i=>({url:i.url,alt:i.alt}))}))}/>
 </>;
}
