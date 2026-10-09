import {ImageAttribution} from '@/components/store/image-attribution';import {ContactForm} from '@/components/store/contact';import {db} from '@/lib/db';import {notFound,permanentRedirect} from 'next/navigation';import Link from 'next/link';import {Newsletter} from '@/components/store/newsletter';import {SavedProducts} from '@/components/store/saved';import {cache} from 'react';import {pageMetadata} from '@/lib/seo';
import {storeConfig} from '@/lib/store-config';
export const dynamic='force-dynamic';
const policyAliases:Record<string,string>={shipping:'delivery','shipping-delivery':'delivery',refunds:'returns','refund-policy':'returns','return-policy':'returns','privacy-policy':'privacy','terms-of-service':'terms'};
function canonicalSlug(slug:string){if(Object.hasOwn(policyAliases,slug))permanentRedirect('/'+policyAliases[slug]);return slug;}
const policy=cache(async(slug:string)=>{const p=await db.policy.findUnique({where:{slug}});if(!p)notFound();return p;});
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const{slug:original}=await params,slug=canonicalSlug(original),config=await storeConfig(),branding={siteName:config.storeName,image:config.homepageBanner};if(slug==='newsletter')return pageMetadata({...branding,title:'The Home Edit Newsletter',description:`Join the ${config.storeName} newsletter for new collections, thoughtful ideas and inspiration for home.`,path:'/newsletter'});if(slug==='wishlist')return pageMetadata({...branding,title:'Your Saved Products',description:`Revisit the ${config.storeName} pieces you have saved and explore their product details.`,path:'/wishlist',index:false});const p=await policy(slug);return pageMetadata({...branding,title:p.title,description:p.body,path:'/'+slug,index:p.published});}
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const{slug:original}=await params;
 if(original==='newsletter')return <Newsletter/>;
 if(original==='wishlist')return <SavedProducts/>;
 const slug=canonicalSlug(original);
 const p=await policy(slug);
 const settings=slug==='contact'?await db.siteSetting.findMany({where:{key:{in:['phone','address','businessHours']}}}):[];
 const contacts=slug==='contact'?await storeConfig():null;
 return <div className="container page-body policy-page">
  <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>{p.title}</span></div>
  <div className="page-title"><p className="eyebrow">HERE TO HELP YOU FEEL AT HOME</p><h1>{p.title}</h1></div>
  <article className="policy-content">{p.body.split('\n\n').map((paragraph,i)=><p key={i}>{paragraph}</p>)}</article>
  {slug==='terms'&&<ImageAttribution/>}
  {contacts&&<><p className="contact-detail">General enquiries, suppliers and business communication: <a href={'mailto:'+contacts.generalEmail}>{contacts.generalEmail}</a></p><p className="contact-detail">Order confirmations, invoices and payment questions: <a href={'mailto:'+contacts.ordersEmail}>{contacts.ordersEmail}</a></p><p className="contact-detail">Customer questions, delivery, cancellations and refunds: <a href={'mailto:'+contacts.supportEmail}>{contacts.supportEmail}</a></p><ContactForm/></>}
  {settings.filter(s=>s.value).map(s=><p className="contact-detail" key={s.key}>{s.value}</p>)}
  <div className="policy-footer"><Link className="text-link" href="/payment-process">Our order process</Link><Link className="text-link" href="/collections/all">Find your retreat</Link></div>
 </div>;
}

