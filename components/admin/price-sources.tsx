import Link from 'next/link';
import {staffPriceSources} from '@/lib/price-sources';
import {sellingPriceCents} from '@/lib/pricing';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';

const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
function price(cents:number|null|undefined){return Number.isSafeInteger(cents)&&typeof cents==='number'&&cents>=0?dollars.format(cents/100):'Not verified';}
function checked(date:string|undefined){
 if(!date||Number.isNaN(Date.parse(date)))return 'No check date recorded';
 return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(date))+' UTC';
}
function sourceUrl(value:string|undefined){
 try{const url=new URL(value??'');return url.protocol==='https:'||url.protocol==='http:'?url.href:null;}catch{return null;}
}

export async function PriceSources(){
 const {records,products}=await staffPriceSources();
 const byId=new Map(products.map(product=>[product.id,product]));
 const verified=records.products.filter(source=>source.status==='verified').length;
 const unverified=records.products.length-verified;
 return <>
  <div className="admin-heading"><div><p className="eyebrow">CATALOG RECORDS</p><h1>Pricing sources.</h1><p>Current catalog prices, discounts, and the source evidence recorded for each model.</p></div></div>
  <section className="metric-grid" aria-label="Price verification summary">
   <article className="metric-card"><div>Products checked</div><strong data-price-count="total">{records.products.length}</strong><p>Model and variant records.</p></article>
   <article className="metric-card"><div>Verified source prices</div><strong data-price-count="verified">{verified}</strong><p>Current source quotes matched to the product.</p></article>
   <article className="metric-card"><div>Unverified source prices</div><strong data-price-count="unverified">{unverified}</strong><p>Review the recorded reason for each model.</p></article>
   <article className="metric-card"><div>Catalog promotion</div><strong>{records.discountPercent}%</strong><p>Last source check: {checked(records.checkedAt)}</p></article>
  </section>
  <section className="panel editor-panel">
   <h2>Price verification</h2>
   <p>Regular and sale prices below come from the product database. A verified source quote records the price listed by that source on its check date. Source prices and availability may change.</p>
   {unverified>0&&<p>{unverified} products do not yet have a verified current source price. Their stored catalog prices are shown separately from source evidence.</p>}
   <p>Changing a discount in the product editor updates current storefront and cart prices. Existing orders retain their saved prices.</p>
  </section>
  {records.products.map(source=>{
   const product=byId.get(source.id),url=sourceUrl(source.sourceUrl);
   return <details className="panel editor-panel" id={source.id} key={source.id} data-price-source-id={source.id}>
    <summary><strong>{source.name}</strong> · <span className="status-badge">{source.status==='verified'?'Verified source price':'Source price unverified'}</span></summary>
    <p>{source.brand} · Model {source.model} · {source.category.replaceAll('-',' ')}{product?' · '+product.sku:''}</p>
    <div>
     <p><strong>Stored regular price:</strong> {product?price(product.priceCents):'Product not in database'}</p>
     <p><strong>Current sale price:</strong> {product?price(sellingPriceCents(product.priceCents,product.discountPercent)):'Product not in database'}{product?' · '+product.discountPercent+'% discount':''}</p>
     <p><strong>Recorded source quote:</strong> {source.status==='verified'?price(source.priceCents):'Not verified'}{source.priceType?' · '+source.priceType:''}</p>
     <p><strong>Checked:</strong> {checked(source.checkedAt)}</p>
     <p>{url?<a href={url} className="text-link" target="_blank" rel="noopener noreferrer">View pricing source</a>:'No source URL recorded'}</p>
    </div>
    {source.status==='unverified'&&<p><strong>Verification reason:</strong> {source.reason||source.note||'No matching current USD selling price was verified.'}</p>}
    {source.note&&source.note!==source.reason&&<p><strong>Source note:</strong> {source.note}</p>}
    {!!source.variants?.length&&<div><h3>Recorded source variant prices</h3><Table className="admin-table"><TableHeader><TableRow><TableHead>Variant / finish</TableHead><TableHead>Source SKU</TableHead><TableHead>Source quote</TableHead></TableRow></TableHeader><TableBody>{source.variants.map((variant,index)=><TableRow key={(variant.supplierSku||variant.sku||variant.color||'variant')+'-'+index}><TableCell>{variant.color||'Selected variant'}</TableCell><TableCell>{variant.supplierSku||variant.sku||'Not recorded'}</TableCell><TableCell>{price(variant.priceCents)}</TableCell></TableRow>)}</TableBody></Table></div>}
    {!!product?.variants.length&&<div><h3>Catalog variant prices</h3>{product.variants.some(variant=>!variant.active)&&<p className="small muted">Retired variants are unavailable for purchase. Their stored prices are retained for historical reference.</p>}<Table className="admin-table"><TableHeader><TableRow><TableHead>Variant / finish</TableHead><TableHead>Catalog SKU</TableHead><TableHead>Availability</TableHead><TableHead>Regular price</TableHead><TableHead>Sale price</TableHead></TableRow></TableHeader><TableBody>{product.variants.map(variant=><TableRow key={variant.id} data-price-variant-id={variant.id} data-price-variant-state={variant.active?'active':'retired'}><TableCell>{variant.name} · {variant.color}{variant.size?' · '+variant.size:''}</TableCell><TableCell>{variant.sku}</TableCell><TableCell><span className="status-badge">{variant.active?'Active':'Retired'}</span></TableCell><TableCell>{price(variant.priceCents)}</TableCell><TableCell>{price(sellingPriceCents(variant.priceCents,product.discountPercent))}</TableCell></TableRow>)}</TableBody></Table></div>}
    <div><Link href={'/admin/products/'+source.id} className="text-link">Edit price or discount</Link>{product&&<> · <Link href={'/products/'+product.slug} className="text-link">View product</Link></>}</div>
   </details>;
  })}
 </>;
}
