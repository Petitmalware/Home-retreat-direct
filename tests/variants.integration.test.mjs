import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db.ts';
import {publicProduct,productInclude} from '../lib/products.ts';

const origin=process.env.APP_ORIGIN??'http://localhost:3000';

test('retiring an option preserves cart and order references while preventing new purchases',{skip:process.env.RUN_INTEGRATION!=='true',timeout:180000},async()=>{
 const cookies=new Map();let product,orderId,cartId;
 const request=async(path,method='GET',body)=>{
  const r=await fetch(origin+path,{method,headers:{origin,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  for(const cookie of r.headers.getSetCookie()){const[k,v]=cookie.split(';')[0].split('=');if(v)cookies.set(k,v);else cookies.delete(k);}
  return {status:r.status,body:await r.json()};
 };
 try{
  const id=randomUUID();
  product=await db.product.create({data:{sku:'TEST-VARIANT-'+id,slug:'test-variant-'+id,name:'TEST ONLY variant availability fixture',shortDescription:'Test only',description:'Isolated availability fixture removed after verification.',priceCents:13799,brand:'TEST',model:'TEST',material:'TEST',dimensions:'TEST',weight:'',shippingWeight:'',warranty:'TEST',deliveryType:'Standard Shipping',deliveryWindow:'TEST',assembly:'TEST',care:'TEST',features:[],included:[],seoTitle:'TEST',seoDescription:'TEST',status:'ACTIVE',isDemo:false,stockStatus:'Special Order',categories:{create:{categoryId:'patio-furniture'}},images:{create:[0,1,2,3].map(i=>({url:'/images/variant-test-'+i+'.jpg',alt:'TEST '+i,position:i,isPrimary:i===0}))},variants:{create:[{sku:'TEST-VARIANT-A-'+id,name:'Available finish',color:'Natural',colorHex:'#ffffff',size:'Standard',priceCents:13799,inventory:{create:{quantity:0,trackingEnabled:false}}},{sku:'TEST-VARIANT-R-'+id,name:'Retired finish',color:'Sand',colorHex:'#c6b69a',size:'Standard',priceCents:21999,active:false,inventory:{create:{quantity:0,trackingEnabled:false}}}]}},include:productInclude});
  const active=product.variants.find(v=>v.color==='Natural'),retired=product.variants.find(v=>v.color==='Sand');
  assert.equal(active.active,true,'existing and newly created variants default to active');
  assert.deepEqual(publicProduct(product).variants.map(v=>v.id),[active.id],'inactive options are excluded from public product choices');
  const payload=(available,extra={})=>({...product,...extra,categoryIds:['patio-furniture'],collectionIds:[],specs:[],variants:product.variants.map(v=>({id:v.id,active:v.id===active.id?available:false,name:v.name,color:v.color,colorHex:v.colorHex,size:v.size,priceCents:v.priceCents,stock:0,trackingEnabled:false}))});
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(false))).status,403);
  assert.equal((await request('/api/cart','POST',{variantId:retired.id,quantity:1})).status,400);
  const added=await request('/api/cart','POST',{variantId:active.id,quantity:1});assert.equal(added.status,200);assert.equal(added.body.items[0].available,true);
  cartId=(await db.cartItem.findFirstOrThrow({where:{variantId:active.id}})).cartId;
  const order=await request('/api/orders','POST',{email:'variant-test@example.test',phone:'317-555-0123',acceptTerms:true,idempotencyKey:randomUUID(),shipping:{firstName:'Variant',lastName:'Test',line1:'123 Test Street',city:'Indianapolis',state:'IN',postalCode:'46204',country:'US'}});assert.equal(order.status,201,JSON.stringify(order.body));orderId=order.body.order.id;
  assert.equal((await request('/api/cart','POST',{variantId:active.id,quantity:1})).status,200);
  const savedCartItem=await db.cartItem.findFirstOrThrow({where:{cartId,variantId:active.id}});
  const snapshot=await db.orderItem.findFirstOrThrow({where:{orderId}});
  assert.equal((await request('/api/auth/login','POST',{email:process.env.SEED_OWNER_EMAIL,password:process.env.SEED_OWNER_PASSWORD})).status,200);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload('yes'))).status,400,'active accepts a boolean only');
  assert.equal((await db.productVariant.findUniqueOrThrow({where:{id:active.id}})).active,true);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(false))).status,200);
  const stored=await db.product.findUniqueOrThrow({where:{id:product.id},include:productInclude});
  assert.equal(stored.variants.length,2,'retired rows are preserved');assert.equal(stored.variants.every(v=>!v.active),true);assert.equal(publicProduct(stored).variants.length,0);
  const admin=await request('/api/admin/products/'+product.id);assert.equal(admin.status,200);assert.equal(admin.body.products[0].variants.length,2,'staff can still manage both options');
  const persisted=await db.cartItem.findUniqueOrThrow({where:{id:savedCartItem.id}});assert.equal(persisted.variantId,active.id);
  const cart=await request('/api/cart');assert.equal(cart.status,200);assert.equal(cart.body.items[0].available,false);
  assert.equal((await request('/api/cart','POST',{variantId:active.id,quantity:1})).status,400);
  assert.equal((await request('/api/cart','PATCH',{variantId:active.id,quantity:2})).status,400);
  const rejected=await request('/api/orders','POST',{email:'variant-test@example.test',phone:'317-555-0123',acceptTerms:true,idempotencyKey:randomUUID(),shipping:{firstName:'Variant',lastName:'Test',line1:'123 Test Street',city:'Indianapolis',state:'IN',postalCode:'46204',country:'US'}});assert.equal(rejected.status,400);assert.match(rejected.body.error,/unavailable/i);
  assert.equal((await db.cartItem.findUniqueOrThrow({where:{id:savedCartItem.id}})).quantity,1);
  const unchanged=await db.orderItem.findUniqueOrThrow({where:{id:snapshot.id}});assert.equal(unchanged.variantId,active.id);assert.equal(unchanged.unitPriceCents,snapshot.unitPriceCents);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(true,{stockStatus:'Out of Stock'}))).status,200);
  assert.equal((await request('/api/cart')).body.items[0].available,false,'out-of-stock products make existing bag entries unavailable');
  assert.equal((await request('/api/cart','PATCH',{variantId:active.id,quantity:2})).status,400);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(true,{status:'ARCHIVED'}))).status,200);
  assert.equal((await request('/api/cart')).body.items[0].available,false,'archived products make existing bag entries unavailable');
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(true))).status,200);
  assert.equal((await request('/api/cart')).body.items[0].available,true,'staff can restore an option without recreating its identifier');
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(false))).status,200);
  assert.equal((await request('/api/cart')).body.items[0].available,false);
  const removed=await request('/api/cart','DELETE',{variantId:active.id});assert.equal(removed.status,200);assert.equal(removed.body.items.length,0,'unavailable options can still be removed');
 }finally{
  if(orderId){const order=await db.order.findUnique({where:{id:orderId}});await db.adminAuditLog.deleteMany({where:{entityId:orderId}});await db.analyticsEvent.deleteMany({where:{orderId}});await db.emailLog.deleteMany({where:{orderId}});await db.order.delete({where:{id:orderId}});if(order)await db.address.deleteMany({where:{id:{in:[order.shippingAddressId,order.billingAddressId]}}});}
  if(cartId)await db.cart.delete({where:{id:cartId}});
  if(product){await db.adminAuditLog.deleteMany({where:{entityId:product.id}});await db.product.delete({where:{id:product.id}});}
  await db.$disconnect();
 }
});
