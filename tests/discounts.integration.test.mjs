import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db.ts';
import {sellingPriceCents} from '../lib/pricing.ts';
const origin=process.env.APP_ORIGIN??'http://localhost:3000';
test('admin discounts reach the storefront, cart and immutable order snapshots',{skip:process.env.RUN_INTEGRATION!=='true',timeout:180000},async()=>{
 const cookies=new Map();let product,orderId,cartId;
 const request=async(path,method='GET',body)=>{const r=await fetch(origin+path,{method,headers:{origin,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const cookie of r.headers.getSetCookie()){const[k,v]=cookie.split(';')[0].split('=');if(v)cookies.set(k,v);else cookies.delete(k);}return {status:r.status,body:await r.json()};};
 try{
  const id=randomUUID();product=await db.product.create({data:{sku:'TEST-DISCOUNT-'+id,slug:'test-discount-'+id,name:'TEST ONLY discount fixture',shortDescription:'Test only',description:'Isolated discount fixture removed after verification.',priceCents:19999,brand:'TEST',model:'TEST',material:'TEST',dimensions:'TEST',weight:'',shippingWeight:'',warranty:'TEST',deliveryType:'Standard Shipping',deliveryWindow:'TEST',assembly:'TEST',care:'TEST',features:[],included:[],seoTitle:'TEST',seoDescription:'TEST',status:'ACTIVE',isDemo:false,stockStatus:'Special Order',categories:{create:{categoryId:'patio-furniture'}},images:{create:[0,1,2,3].map(i=>({url:'/images/discount-test-'+i+'.jpg',alt:'TEST '+i,position:i,isPrimary:i===0}))},variants:{create:{sku:'TEST-DISCOUNT-V-'+id,name:'TEST',color:'TEST',colorHex:'#ffffff',size:'TEST',priceCents:19999,inventory:{create:{quantity:0,trackingEnabled:false}}}}},include:{variants:{include:{inventory:true}},categories:true,collections:true,specifications:true}});
  await db.productImage.updateMany({where:{productId:product.id,position:2},data:{variantId:product.variants[0].id}});
  const payload=(discountPercent)=>({...product,discountPercent,categoryIds:['patio-furniture'],collectionIds:[],specs:[],variants:product.variants.map(v=>({id:v.id,name:v.name,color:v.color,colorHex:v.colorHex,size:v.size,priceCents:v.priceCents,stock:0,trackingEnabled:false}))});
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(15))).status,403);
  assert.equal((await request('/api/auth/login','POST',{email:process.env.SEED_OWNER_EMAIL,password:process.env.SEED_OWNER_PASSWORD})).status,200);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(95))).status,400);
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(15))).status,200);
  const stored=await db.product.findUniqueOrThrow({where:{id:product.id},include:{variants:true}});assert.equal(stored.discountPercent,15);assert.equal(stored.priceCents,19999);assert.equal(stored.variants[0].priceCents,19999);
  const variantId=product.variants[0].id,discounted=sellingPriceCents(19999,15);
  const cart=await request('/api/cart','POST',{variantId,quantity:2});assert.equal(cart.status,200);assert.equal(cart.body.items.find(i=>i.variantId===variantId).unitPrice,discounted/100);assert.equal(cart.body.items.find(i=>i.variantId===variantId).image,'/images/discount-test-2.jpg');
  cartId=(await db.cartItem.findFirstOrThrow({where:{variantId}})).cartId;
  const order=await request('/api/orders','POST',{email:'discount-test@example.test',phone:'317-555-0123',acceptTerms:true,idempotencyKey:randomUUID(),shipping:{firstName:'Discount',lastName:'Test',line1:'123 Test Street',city:'Indianapolis',state:'IN',postalCode:'46204',country:'US'}});assert.equal(order.status,201,JSON.stringify(order.body));orderId=order.body.order.id;
  const snapshot=await db.order.findUniqueOrThrow({where:{id:orderId},include:{items:true}});assert.equal(snapshot.items[0].unitPriceCents,discounted);assert.equal(snapshot.subtotalCents,discounted*2);assert.equal(snapshot.items[0].image,'/images/discount-test-2.jpg');
  assert.equal((await request('/api/admin/products/'+product.id,'POST',payload(0))).status,200);
  assert.equal((await db.orderItem.findFirstOrThrow({where:{orderId}})).unitPriceCents,discounted);
  assert.equal((await request('/api/cart','POST',{variantId,quantity:1})).body.items[0].unitPrice,199.99);
 }finally{
  if(orderId){const order=await db.order.findUnique({where:{id:orderId}});await db.adminAuditLog.deleteMany({where:{entityId:orderId}});await db.analyticsEvent.deleteMany({where:{orderId}});await db.emailLog.deleteMany({where:{orderId}});await db.order.delete({where:{id:orderId}});if(order)await db.address.deleteMany({where:{id:{in:[order.shippingAddressId,order.billingAddressId]}}});}
  if(cartId)await db.cart.delete({where:{id:cartId}});
  if(product){await db.adminAuditLog.deleteMany({where:{entityId:product.id}});await db.product.delete({where:{id:product.id}});}
  await db.$disconnect();
 }
});
