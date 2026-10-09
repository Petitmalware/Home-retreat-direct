import type {Metadata} from 'next';
import type {CatalogProduct} from './catalog';
import type {StoreConfig} from './store-config';
import {initialVariant} from './variant-gallery';

const defaultName='Home Retreat Direct';

/** One configured origin prevents forwarded hosts and query strings becoming canonicals. */
export function publicOrigin(value=process.env.APP_ORIGIN){
 if(!value?.trim()&&process.env.NODE_ENV==='production')throw new Error('Set APP_ORIGIN to the deployed storefront origin before building or starting production.');
 const raw=value?.trim()||'http://localhost:3000';
 const url=new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path, credentials, query or fragment.');
 return url.origin;
}

export function siteUrl(path='/'){
 if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Canonical paths must be relative to this storefront.');
 const url=new URL(path,publicOrigin());
 if(url.origin!==publicOrigin())throw new Error('Canonical paths must stay on this storefront.');
 url.search='';url.hash='';
 if(url.pathname!=='/')url.pathname=url.pathname.replace(/\/+$/,'');
 return url.href;
}

export function assetUrl(value:string){
 try{const url=new URL(value,publicOrigin());return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}

export function plainText(value:string){return value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}

export function metaDescription(value:string,maxLength=165){
 const text=plainText(value);
 if(text.length<=maxLength)return text;
 const cut=text.slice(0,maxLength-1),space=cut.lastIndexOf(' ');
 return cut.slice(0,space>maxLength*.65?space:cut.length).trimEnd()+'…';
}

type PageMetadata={title:string;description:string;path:string;image?:string;index?:boolean;follow?:boolean;siteName?:string};
export function pageMetadata({title,description,path,image='/images/hero.jpg',index=true,follow=true,siteName=defaultName}:PageMetadata):Metadata{
 const label=plainText(title),summary=metaDescription(description),url=siteUrl(path),photo=assetUrl(image);
 const fullTitle=label===siteName?label:`${label} | ${siteName}`;
 return {
  title:{absolute:fullTitle},description:summary,alternates:{canonical:url},robots:{index,follow},
  openGraph:{type:'website',locale:'en_US',siteName,title:fullTitle,description:summary,url,...(photo?{images:[{url:photo,alt:label}]}:{})},
  twitter:{card:'summary_large_image',title:fullTitle,description:summary,...(photo?{images:[photo]}:{})},
 };
}

export function organizationSchema(config:Pick<StoreConfig,'storeName'|'logoUrl'|'supportEmail'|'phone'|'socialInstagram'|'socialFacebook'>){
 const logo=config.logoUrl?assetUrl(config.logoUrl):undefined;
 const sameAs=[config.socialInstagram,config.socialFacebook].filter(Boolean).map(assetUrl).filter((url):url is string=>!!url);
 return {
  '@context':'https://schema.org','@type':'Organization','@id':siteUrl('/')+'#organization',name:config.storeName,url:siteUrl('/'),
  ...(logo?{logo}:{}),...(config.supportEmail?{email:config.supportEmail}:{}),...(config.phone?{telephone:config.phone}:{}),...(sameAs.length?{sameAs:[...new Set(sameAs)]}:{}),
 };
}

/** Unknown special-order stock is not advertised as in stock or preorder. */
export function productSchema(p:CatalogProduct){
 const url=siteUrl('/products/'+encodeURIComponent(p.slug)),selected=initialVariant(p);
 const availability=({'In Stock':'InStock','Low Stock':'LimitedAvailability','Out of Stock':'OutOfStock',Preorder:'PreOrder'} as Record<string,string>)[p.stockStatus];
 const price=selected?.price??p.price;
 const facts=[{label:'Dimensions',value:p.dimensions},...p.specs].filter(fact=>fact.value?.trim());
 return {
  '@context':'https://schema.org','@type':'Product','@id':url+'#product',url,name:p.name,description:plainText(p.description),sku:p.sku,
  ...(p.model?{model:p.model}:{}),...(p.brand?{brand:{'@type':'Brand',name:p.brand}}:{}),...(p.material?{material:p.material}:{}),image:p.images.map(assetUrl).filter(Boolean),
  ...(facts.length?{additionalProperty:facts.map(fact=>({'@type':'PropertyValue',name:fact.label,value:fact.value}))}:{}),
  ...(!p.isDemo&&!p.previewOnly&&selected&&Number.isFinite(price)&&price>0?{offers:{'@type':'Offer',url,price:price.toFixed(2),priceCurrency:'USD',seller:{'@id':siteUrl('/')+'#organization'},...(availability?{availability:'https://schema.org/'+availability}:{})}}:{}),
  ...(p.reviewCount>0&&Number.isInteger(p.reviewCount)&&Number.isFinite(p.rating)&&p.rating>=1&&p.rating<=5&&!p.isDemo?{aggregateRating:{'@type':'AggregateRating',ratingValue:p.rating,reviewCount:p.reviewCount,bestRating:5,worstRating:1}}:{}),
 };
}

export function productBreadcrumbSchema(p:CatalogProduct){
 return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
  {'@type':'ListItem',position:1,name:'Home',item:siteUrl('/')},
  {'@type':'ListItem',position:2,name:p.categoryName??p.category,item:siteUrl('/collections/'+encodeURIComponent(p.category))},
  {'@type':'ListItem',position:3,name:p.name,item:siteUrl('/products/'+encodeURIComponent(p.slug))},
 ]};
}

export function serializeJsonLd(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
