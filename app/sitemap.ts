import type {MetadataRoute} from 'next';
import {db} from '@/lib/db';
import {siteUrl} from '@/lib/seo';

export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const [products,categories,collections,policies]=await Promise.all([
  db.product.findMany({where:{status:'ACTIVE',isDemo:false},select:{slug:true,updatedAt:true}}),
  db.category.findMany({select:{slug:true}}),
  db.collection.findMany({select:{slug:true}}),
  db.policy.findMany({where:{published:true},select:{slug:true,updatedAt:true}}),
 ]);
 const publicCollections=[...new Set(['all','featured','best-sellers','new-arrivals',...categories.map(c=>c.slug),...collections.map(c=>c.slug)])];
 const pages:MetadataRoute.Sitemap=[
  {url:siteUrl('/'),changeFrequency:'weekly',priority:1},
  {url:siteUrl('/newsletter'),changeFrequency:'monthly',priority:.3},
  ...publicCollections.map(slug=>({url:siteUrl('/collections/'+encodeURIComponent(slug)),changeFrequency:'weekly' as const,priority:.8})),
  ...products.map(p=>({url:siteUrl('/products/'+encodeURIComponent(p.slug)),lastModified:p.updatedAt,priority:.7})),
  ...policies.map(p=>({url:siteUrl('/'+encodeURIComponent(p.slug)),lastModified:p.updatedAt,priority:.3})),
 ];
 return [...new Map(pages.map(page=>[page.url,page])).values()];
}
