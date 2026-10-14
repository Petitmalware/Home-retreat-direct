import {Buffer} from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import catalog from '../data/christmas-catalog.json';
import {galleryReady} from '../lib/product-gallery';
import {productVideoUrl} from '../lib/product-video';

test('every Christmas product has six or more distinct real image files and a sourced selling price',()=>{
 const hashes=new Set<string>();
 assert.equal(catalog.products.length,20);
 for(const p of catalog.products){assert(p.images.length>=6&&galleryReady(p.images));assert(p.priceCents>0&&p.sourcePriceCents===p.priceCents);assert.equal(p.discountPercent,15);assert.match(p.source,/^https:\/\/www\.costway\.com\//);
  for(const image of p.images){const bytes=fs.readFileSync(path.join('public',image.url));const sha=createHash('sha256').update(bytes).digest('hex');assert.equal(sha,image.sha256);assert(!hashes.has(sha));hashes.add(sha);}
  if(p.videoUrl)assert(productVideoUrl(p.videoUrl));
 }
 assert(catalog.products.filter(p=>p.videoUrl).length>=3);
});

test('seasonal install and checkout use an isolated database and preserve staff edits and existing orders',{timeout:120000},async t=>{
 const memory=await PGlite.create();let socket:PGLiteSocketServer|undefined,database:(typeof import('../lib/db'))['db']|undefined;
 try{
  for(const folder of fs.readdirSync('prisma/migrations').sort()){const file=path.join('prisma/migrations',folder,'migration.sql');if(fs.existsSync(file))await memory.exec(fs.readFileSync(file,'utf8'));}
  socket=new PGLiteSocketServer({db:memory,host:'127.0.0.1',port:0});await socket.start();
  Object.assign(process.env,{DATABASE_URL:'postgresql://postgres:isolated@'+socket.getServerConn()+'/postgres',DATABASE_TRANSPORT:'pg',LOCAL_DATABASE_ENGINE:'pglite',DEVELOPMENT_CATALOG:'false',SITES_RUNTIME:'false',APP_ORIGIN:'https://homeretreatdirect.com',ENCRYPTION_KEY:Buffer.from(randomBytes(32)).toString('hex'),EMAIL_PROVIDER:'smtp',EMAIL_DELIVERY_ENABLED:'true',SMTP_HOST:'mail.example.test',SMTP_PORT:'465',SMTP_SECURE:'true',INFO_EMAIL:'info@example.test',ORDERS_EMAIL:'orders@example.test',SUPPORT_EMAIL:'support@example.test',SMTP_INFO_USER:'info@example.test',SMTP_INFO_PASS:'fixture-unused',SMTP_ORDERS_USER:'orders@example.test',SMTP_ORDERS_PASS:'fixture-unused',SMTP_SUPPORT_USER:'support@example.test',SMTP_SUPPORT_PASS:'fixture-unused'});
  database=(await import('../lib/db')).db;const db=database;
  const {installChristmasCatalog}=await import('../lib/install-christmas');const {readChristmasSeason}=await import('../lib/seasonal-store');
  await assert.rejects(installChristmasCatalog(db),/Initialize/);
  assert.equal(await db.collection.count(),0);
  await db.user.create({data:{email:'owner@example.test',name:'Fixture owner',passwordHash:'fixture',staff:{create:{role:'OWNER'}}}});
  await db.product.create({data:{id:'fixture-core',sku:'CORE',slug:'fixture-core',name:'Fixture core product',description:'Isolated test product; never sold.',shortDescription:'Fixture',priceCents:12345,brand:'Fixture',model:'Fixture',material:'Fixture',dimensions:'Fixture',weight:'',shippingWeight:'',warranty:'Fixture',deliveryType:'Standard Shipping',deliveryWindow:'Fixture',assembly:'',care:'',features:[],included:[],seoTitle:'Fixture',seoDescription:'Fixture'}});
  const installed=await installChristmasCatalog(db);assert.equal(installed.added,20);assert.equal((await readChristmasSeason()).active,true);
  assert.equal(await db.product.count(),21);assert.equal((await db.product.findUniqueOrThrow({where:{id:'fixture-core'}})).priceCents,12345);assert.equal(await db.review.count(),0);
  const {completeStoreOpening}=await import('../lib/open-store');await db.$transaction(tx=>completeStoreOpening(tx));
  const {products,product}=await import('../lib/products');const {submitOrder}=await import('../lib/orders');const sitemap=(await import('../app/sitemap')).default;
  const p=catalog.products[0];const variant=await db.productVariant.findFirstOrThrow({where:{productId:p.id}});
  const cart=await db.cart.create({data:{tokenHash:Buffer.from(randomBytes(32)).toString('hex'),items:{create:{variantId:variant.id,quantity:1}}}});
  const payload={email:'customer@example.test',phone:'317-555-0100',shipping:{firstName:'Fixture',lastName:'Customer',line1:'100 Test Street',city:'Indianapolis',state:'IN',postalCode:'46204',country:'US'},acceptTerms:true,idempotencyKey:randomUUID()};
  await t.test('on publishes product content and indexable URLs and accepts an unpaid order',async()=>{
   assert.equal((await products()).length,21);const publicProduct=await product(p.slug);assert(publicProduct&&publicProduct.images.length>=6);assert((await sitemap()).some(page=>page.url.endsWith('/collections/christmas')));
   const order=await submitOrder(payload,cart.id);assert.equal(order.order.totalCents,Math.round(p.priceCents*.85));assert.equal(await db.payment.count(),0);assert.equal(await db.order.count(),1);
  });
  await t.test('off hides seasonal pages and prevents stale-cart checkout while retaining the order',async()=>{
   await db.siteSetting.update({where:{key:'christmasSeason'},data:{value:JSON.stringify({mode:'off',startsOn:'',endsOn:''})}});
   assert.equal((await products()).length,1);assert.equal(await product(p.slug),null);assert(!(await sitemap()).some(page=>page.url.includes('/christmas')||page.url.includes('/costway')));
   const stale=await db.cart.create({data:{tokenHash:Buffer.from(randomBytes(32)).toString('hex'),items:{create:{variantId:variant.id,quantity:1}}}});
   const before={orders:await db.order.count(),addresses:await db.address.count(),emails:await db.emailLog.count()};
   await assert.rejects(submitOrder({...payload,idempotencyKey:randomUUID()},stale.id),error=>(error as {status:number}).status===400);
   assert.equal(await db.order.count(),before.orders);assert.equal(await db.address.count(),before.addresses);assert.equal(await db.emailLog.count(),before.emails);assert.equal(await db.orderItem.count(),1);
  });
  await t.test('reinstallation preserves a hidden switch, edited price, image order and order snapshots',async()=>{
   await db.product.update({where:{id:p.id},data:{priceCents:9999,description:'Staff-written seasonal description, preserved.'}});
   const image=await db.productImage.findFirstOrThrow({where:{productId:p.id}});await db.productImage.update({where:{id:image.id},data:{alt:'Staff-selected alternate text'}});
   assert.equal((await installChristmasCatalog(db)).added,0);assert.equal((await readChristmasSeason()).active,false);
   assert.equal((await db.product.findUniqueOrThrow({where:{id:p.id}})).priceCents,9999);assert.equal((await db.productImage.findUniqueOrThrow({where:{id:image.id}})).alt,'Staff-selected alternate text');assert.equal((await db.orderItem.findFirstOrThrow()).unitPriceCents,Math.round(p.priceCents*.85));
   assert((await db.emailLog.findMany()).every(email=>email.status==='QUEUED'&&!email.sentAt));
  });
 }finally{if(database)await database.$disconnect();if(socket)await socket.stop();await memory.close();}
});
