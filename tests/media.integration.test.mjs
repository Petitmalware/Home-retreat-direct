import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {db} from '../lib/db.ts';
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:3000';
test('owner can update local product photography with protected persistent uploads',{skip:process.env.RUN_INTEGRATION!=='true'||process.env.SITES_RUNTIME==='true',timeout:180000},async t=>{
 const cookies=new Map(),assets=[];let fixture;
 const request=async(url,options={},authenticated=true)=>fetch(origin+url,{...options,headers:{origin,...(authenticated?{cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}:{}),...options.headers}});
 const post=async(url,data)=>request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const upload=(bytes,mime='image/jpeg',authenticated=true,headers={})=>{const form=new FormData();form.set('file',new File([bytes],'test-image.jpg',{type:mime}));return request('/api/uploads',{method:'POST',body:form,headers},authenticated)};
 try{
  const login=await post('/api/auth/login',{email:process.env.SEED_OWNER_EMAIL,password:process.env.SEED_OWNER_PASSWORD});assert.equal(login.status,200);for(const value of login.headers.getSetCookie()){const[k,v]=value.split(';')[0].split('=');cookies.set(k,v);}
  const bytes=await fs.readFile('public/images/products/fermob-bistro.jpeg');
  await t.test('upload requires staff authorization and same-origin requests',async()=>{assert.equal((await upload(bytes,'image/jpeg',false)).status,403);assert.equal((await upload(bytes,'image/jpeg',true,{origin:'https://untrusted.example'})).status,403);});
  await t.test('unsupported, disguised and oversized files are rejected',async()=>{assert.equal((await upload(Buffer.from('<svg/>'),'image/svg+xml')).status,400);assert.equal((await upload(Buffer.from('not an image'),'image/jpeg')).status,400);assert.equal((await upload(Buffer.alloc(8*1024*1024+1),'image/jpeg')).status,400);});
  let image;
  await t.test('valid upload is stored locally and serves the exact bytes',async()=>{const r=await upload(bytes);assert.equal(r.status,200);image=await r.json();assert.match(image.url,/^\/api\/media\/[a-f0-9-]{36}\.jpg$/);assets.push(image);const asset=await request(image.url);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/jpeg');assert.equal(asset.headers.get('x-content-type-options'),'nosniff');assert.equal(createHash('sha256').update(new Uint8Array(await asset.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));assert.equal((await request('/api/media/not-a-valid-filename.jpg')).status,404);});
  fixture=await db.product.create({data:{sku:'TEST-MEDIA-'+randomUUID(),slug:'test-media-'+randomUUID(),name:'TEST ONLY image fixture',shortDescription:'Test only',description:'Isolated photograph upload test fixture.',priceCents:100,brand:'TEST',model:'TEST',material:'TEST',dimensions:'TEST',weight:'TEST',shippingWeight:'TEST',warranty:'TEST',deliveryType:'Curbside Freight',deliveryWindow:'TEST',assembly:'TEST',care:'TEST',features:[],included:[],seoTitle:'TEST',seoDescription:'TEST',status:'DRAFT',isDemo:false}});
  await t.test('admin gallery preserves ordering, alt text and primary image',async()=>{const gallery=[{url:image.url,alt:'Owner local photograph',kind:'PRODUCT'},{url:'/images/products/fermob-bistro.jpeg',alt:'Existing local photograph',kind:'LIFESTYLE'}];const r=await post('/api/admin/products/'+fixture.id+'/images',{images:gallery});assert.equal(r.status,200);const stored=await db.productImage.findMany({where:{productId:fixture.id},orderBy:{position:'asc'}});assert.deepEqual(stored.map(i=>({url:i.url,alt:i.alt,kind:i.kind})),gallery);assert.equal(stored[0].isPrimary,true);assert.equal(stored[1].isPrimary,false);assert.equal((await post('/api/admin/products/'+fixture.id+'/images',{images:[gallery[0],gallery[0]]})).status,400);});
  await t.test('active galleries cannot be reduced below four photographs',async()=>{await db.product.update({where:{id:fixture.id},data:{status:'ACTIVE'}});assert.equal((await post('/api/admin/products/'+fixture.id+'/images',{images:[{url:image.url,alt:'Photo',kind:'PRODUCT'}]})).status,400);});
 }finally{
  if(fixture){await db.product.delete({where:{id:fixture.id}});await db.adminAuditLog.deleteMany({where:{entityId:fixture.id}});}
  for(const image of assets){await db.adminAuditLog.deleteMany({where:{entityId:image.publicId}});await fs.rm(path.join(process.cwd(),'.local/media',image.url.split('/').at(-1)),{force:true});}
  await db.$disconnect();
 }
});
