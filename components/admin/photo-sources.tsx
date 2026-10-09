import Link from 'next/link';
import {staff} from '@/lib/security';
import {sourcedGalleries} from '@/lib/gallery-provenance';
import documentary from '@/data/photo-source-records/documentary.json';
import decorative from '@/data/photo-source-records/decorative.json';

export async function PhotoSources(){
 await staff('products');
 const licensed=sourcedGalleries.filter(product=>product.license==='CC BY 4.0');
 return <>
  <div className="admin-heading"><div><p className="eyebrow">CATALOG RECORDS</p><h1>Photography sources.</h1><p>Image attribution, original sources, and commercial use records for the product catalog.</p></div></div>
  <section className="panel editor-panel">
   <h2>Catalog photography</h2>
   <p>{sourcedGalleries.length} products · {sourcedGalleries.reduce((count,product)=>count+product.images.length,0)} photographs · {licensed.length} products with CC BY 4.0 photography.</p>
   <p>Amazon Berkeley Objects photography and product metadata © Amazon.com, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" className="text-link">CC BY 4.0</a>. Original files are retained; website previews are resized. <a href="https://amazon-berkeley-objects.s3.us-east-1.amazonaws.com/index.html" className="text-link">Dataset and creator credits</a> · <a href="/images/catalog/LICENSE-CC-BY-4.0.txt" className="text-link">Full license and warranty disclaimer</a>.</p>
   <p>Manufacturer gallery records do not establish permission for commercial photo reuse. Check the use record for each product before publishing.</p>
  </section>
  {sourcedGalleries.map(product=><details className="panel editor-panel" id={product.id} key={product.id}>
   <summary><strong>{product.name}</strong> · {product.images.length} images</summary>
   <p>{product.brand} · {product.model} · {product.sku??product.id}</p>
   <p>{product.credit} · <a href={product.source} className="text-link">Source catalog</a> · <a href={product.licenseUrl} className="text-link">{product.license}</a></p>
   {product.reuseStatus&&<p><strong>Use record:</strong> {product.reuseStatus}</p>}
   <p>{product.changes}</p>
   <ul>{product.images.map(image=><li key={image.url}><a href={image.url}>{image.alt}</a> — <a href={image.source}>Original image {image.imageId}</a><br/><small style={{overflowWrap:'anywhere'}}>{image.width} × {image.height} pixels · SHA-256: {image.sha256}</small></li>)}</ul>
   <Link href={'/admin/products/'+product.id} className="text-link">Edit product images</Link> · <Link href={'/products/'+product.slug} className="text-link">View product gallery</Link>
  </details>)}
  <section className="panel editor-panel"><h2>Decorative photography</h2><p>Homepage and editorial image records.</p>{decorative.images.map(image=><details key={image.localFile}><summary>{image.localFile} · {image.photographer}</summary><p><a href={image.sourcePage} className="text-link">Original photograph</a> · <a href={decorative.licenseSources[image.license as keyof typeof decorative.licenseSources]} className="text-link">{image.license} license</a></p><p>{image.notes}</p></details>)}</section>
  <section className="panel editor-panel"><h2>Earlier documentary photographs</h2><p>These records are retained for archived reference products.</p>{documentary.images.map(product=><p key={product.image}>{product.model}: {product.credit} <a href={product.source}>Original photograph</a> · <a href={product.licenseUrl}>{product.license}</a>. Original files retained; previews may be resized.</p>)}</section>
 </>;
}
