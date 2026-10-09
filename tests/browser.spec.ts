import 'dotenv/config';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {money} from '../lib/catalog';
import {sellingPriceCents} from '../lib/pricing';
import type {SourcedGallery} from '../lib/gallery-provenance';
const sourcedGalleries=JSON.parse(fs.readFileSync('data/product-galleries.json','utf8')).products as SourcedGallery[];
const patio=sourcedGalleries.filter(p=>p.category==='patio-furniture'),first=patio[0];
test('business contacts and enquiry topics remain usable on desktop and mobile',async({page})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto('/contact');
  await expect(page.getByRole('heading',{name:/contact/i,level:1})).toBeVisible();
  for(const address of ['info@homeretreatdirect.com','orders@homeretreatdirect.com','support@homeretreatdirect.com'])await expect(page.locator('.policy-page a[href="mailto:'+address+'"]')).toBeVisible();
  const topic=page.getByRole('combobox',{name:'Enquiry type'});await expect(topic).toHaveValue('GENERAL');
  await topic.selectOption('SUPPORT');await expect(topic).toHaveValue('SUPPORT');
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('browse, filter, compare and inspect real model photography',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/collections/patio-furniture');await expect(page.locator('.product-card')).toHaveCount(Math.min(12,patio.length));
 await expect(page.locator('.card-price .price').first()).toContainText('$');
 await expect(page.locator('.demo-notice')).toHaveCount(0);
 await page.getByRole('textbox',{name:'Search collection'}).fill('nonexistentxyz');await expect(page.locator('.product-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(page.locator('.product-card')).toHaveCount(Math.min(12,patio.length));
 await page.locator('.product-card .compare-check').nth(0).click();await page.locator('.product-card .compare-check').nth(1).click();await page.getByRole('link',{name:'Compare products',exact:true}).click();await expect(page.locator('.comparison-table')).toBeVisible();
 await page.goto('/products/'+first.slug);await expect(page.locator('.thumbnails button')).toHaveCount(first.images.length);
 await expect(page.locator('.thumbnails button').nth(2)).toHaveAttribute('aria-label','View image 3');
 for(const [index,image] of first.images.entries()){await page.locator('.thumbnails button').nth(index).click();await expect(page.locator('.main-product-photo img')).toHaveAttribute('alt',image.alt);await expect(page.locator('.main-product-photo img')).toHaveJSProperty('complete',true);}
 await expect(page.getByRole('button',{name:'Place order for review',exact:true})).toBeEnabled();
 await expect(page.locator('.product-price')).toContainText(money(sellingPriceCents(first.priceCents!,first.discountPercent??0)/100));
 if(first.discountPercent){await expect(page.locator('.product-price del')).toHaveText(money(first.priceCents!/100));await expect(page.locator('.product-sale')).toContainText(first.discountPercent+'% off');}
 await expect(page.getByRole('link',{name:'Photography credits',exact:true})).toHaveCount(0);await page.goto('/image-credits');await expect(page).toHaveURL(/\/terms#image-attribution$/);await expect(page.locator('#image-attribution')).toBeVisible();await expect(page.locator('#'+first.id)).toHaveCount(0);expect(errors).toEqual([]);
});
test('mobile galleries and all collection pages fit the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const route of ['/','/collections/all','/collections/patio-furniture','/products/'+first.slug,'/cart','/checkout','/compare?ids='+patio[0].id+','+patio[1].id,'/track-order','/account']){await page.goto(route);await expect(page.locator('h1,h2').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth),route).toBe(390);}
 for(const slug of ['gazebos','patio-furniture','fire-pits','electric-fireplaces','premium-furniture','massage-chairs','saunas']){await page.goto('/collections/'+slug);await expect(page.locator('h1')).toBeVisible();const count=sourcedGalleries.filter(p=>p.category===slug).length;expect(count,slug+' has real products').toBeGreaterThan(0);await expect(page.locator('.product-card')).toHaveCount(Math.min(12,count));await expect(page.locator('.card-price .price').first()).toContainText('$');}
});
test('owner studio retains image replacement, ordering and alt-text tools',async({page})=>{
 await page.goto('/admin');await expect(page.locator('#main')).toBeVisible();await page.getByLabel('Email',{exact:true}).fill(process.env.SEED_OWNER_EMAIL!);await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_OWNER_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.admin-content h1')).toBeVisible({timeout:60000});
 for(const route of ['/admin/orders','/admin/products','/admin/reviews','/admin/policies','/admin/staff','/admin/settings','/admin/customers','/admin/audit','/admin/taxonomy']){await page.goto(route);await expect(page.locator('.admin-content h1')).toBeVisible();}
 await page.goto('/admin/products/'+first.id);await expect(page.getByLabel('Discount (%)',{exact:true})).toHaveAttribute('max','90');await page.getByRole('tab',{name:'Images',exact:true}).click();await expect(page.getByRole('button',{name:'Save image changes',exact:true})).toBeVisible();await expect(page.locator('.image-editor-card')).toHaveCount(first.images.length);await expect(page.locator('input[type=file]')).toHaveAttribute('multiple','');await expect(page.getByLabel('Alt text',{exact:true})).toHaveCount(first.images.length);
});

test('finish options and associated gallery photographs stay in step',async({page})=>{
 for(const product of sourcedGalleries.filter(p=>p.variants?.length)){
  await page.goto('/products/'+product.slug);
  await expect(page.locator('.variant-options button[aria-pressed="true"]')).toContainText(product.color);
  for(const[index,image]of product.images.entries()){
   if(!image.color||!product.variants?.some(v=>v.color===image.color))continue;
   await page.locator('.thumbnails button').nth(index).click();
   await expect(page.locator('.main-product-photo img')).toHaveAttribute('alt',image.alt);
   await expect(page.locator('.variant-options button[aria-pressed="true"]')).toContainText(image.color);
  }
 }
});

test('massage comfort filters offer real matches and reset restores the collection',async({page})=>{
 const chairs=sourcedGalleries.filter(product=>product.category==='massage-chairs');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/collections/massage-chairs');
 const count=page.locator('.listing-toolbar > span').first();
 await expect(count).toHaveText(chairs.length+' pieces');
 const comfort=page.getByRole('combobox',{name:'Massage comfort selector'});
 await comfort.click();
 const choices=(await page.getByRole('option').allTextContents()).map(label=>label.trim()).filter(label=>label!=='Full body relaxation');
 expect(choices.length).toBeGreaterThan(0);
 await page.keyboard.press('Escape');
 for(const label of choices){
  await comfort.click();await page.getByRole('option',{name:label,exact:true}).click();
  await expect(comfort).toHaveText(label);
  await expect(page.locator('.product-card').first(),label).toBeVisible();
  expect(Number((await count.innerText()).match(/\d+/)?.[0]),label).toBeGreaterThan(0);
  await page.getByRole('textbox',{name:'Search collection'}).fill('nonexistentxyz');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await expect(comfort).toHaveText('Full body relaxation');
  await expect(count).toHaveText(chairs.length+' pieces');
  await expect(page.locator('.product-card')).toHaveCount(Math.min(12,chairs.length));
 }
 if(!chairs.some(product=>product.stockStatus==='In Stock'))await expect(page.getByRole('checkbox',{name:'In stock',exact:true})).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Rating',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Sort products'}).click();
 await expect(page.getByRole('option',{name:'Best selling',exact:true})).toHaveCount(0);
 await page.getByRole('option',{name:'Our favorites',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Sort products'})).toHaveText('Our favorites');
 await page.goto('/collections/patio-furniture');
 await page.getByRole('textbox',{name:'Search collection'}).fill('nonexistentxyz');
 await expect(page.locator('.product-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 await expect(page.locator('.product-card')).toHaveCount(Math.min(12,patio.length));
 const maximum=page.locator('[data-slot="slider-thumb"]');
 await expect(maximum).toHaveAttribute('aria-valuemin','0');
 const affordableCeiling=Math.ceil(Math.min(...patio.map(product=>product.priceCents!/100))/100)*100;
 expect(affordableCeiling).toBeLessThan(500);
 await maximum.press('Home');
 await expect(maximum).toHaveAttribute('aria-valuenow','0');
 for(let ceiling=0;ceiling<affordableCeiling;ceiling+=100)await maximum.press('ArrowRight');
 await expect(maximum).toHaveAttribute('aria-valuenow',String(affordableCeiling));
 await expect(page.locator('.product-card').first()).toBeVisible();
 expect(errors).toEqual([]);
});

test('product facts are server rendered and tabs retain the same visible layout',async({page,browser})=>{
 await page.goto('/products/'+first.slug);
 const panels=page.locator('.product-tabs [data-slot="tabs-content"]');
 await expect(panels).toHaveCount(10);await expect(page.locator('.product-tabs [data-slot="tabs-content"][hidden]')).toHaveCount(9);
 for(const label of ['Features','Specifications','Reviews','Overview']){
  await page.getByRole('tab',{name:label,exact:true}).click();
  await expect(page.locator('.product-tabs [data-slot="tabs-content"][data-state="active"]')).toBeVisible();
  await expect(page.locator('.product-tabs [data-slot="tabs-content"][hidden]')).toHaveCount(9);
 }
 const context=await browser.newContext({javaScriptEnabled:false});
 try{
  const serverPage=await context.newPage();await serverPage.goto('http://localhost:3000/products/'+first.slug);
  await expect(serverPage.locator('h1')).toHaveText(first.name);
  await expect(serverPage.locator('.product-price')).toBeVisible();
  const serverPanels=serverPage.locator('.product-tabs [data-slot="tabs-content"]');await expect(serverPanels).toHaveCount(10);
  await expect(serverPanels.nth(1)).toContainText(first.features[0]);await expect(serverPanels.nth(2)).toContainText(first.model);
  await expect(serverPanels.nth(2)).toContainText(first.brand);
  await expect(serverPanels.nth(3)).toContainText(first.dimensions);
 }finally{await context.close();}
});

test('verified finish prices apply the store discount without changing the regular amount',async({page})=>{
 const product=sourcedGalleries.find(product=>product.id==='prd-massage-chairs-3')!;
 await page.goto('/products/'+product.slug);
 for(const color of ['Beige','Black','Dark Brown']){
  const variant=product.variants!.find(variant=>variant.color===color)!;
  const sale=sellingPriceCents(variant.priceCents,product.discountPercent??0);
  await page.locator('.variant-options').getByRole('button',{name:color,exact:true}).click();
  await expect(page.locator('.product-price')).toContainText(money(sale/100));
  await expect(page.locator('.product-price del')).toHaveText(money(variant.priceCents/100));
  await expect(page.locator('.product-sale')).toContainText('You save '+money((variant.priceCents-sale)/100));
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto('/collections/massage-chairs');
 await expect(page.locator('.card-price .sale-label').first()).toHaveText('15% off');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('customer review navigation, rating filters and desktop form remain accessible',async({page})=>{
 await page.goto('/products/'+first.slug);
 await page.getByRole('button',{name:'Read customer reviews',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Reviews',exact:true})).toHaveAttribute('aria-selected','true');
 const reviews=page.getByRole('region',{name:'Customer reviews',exact:true});
 await expect(reviews).toBeVisible();
 await reviews.getByRole('button',{name:'Show 2-star reviews',exact:true}).click();
 await expect(reviews.getByRole('button',{name:'Show 2-star reviews',exact:true})).toHaveAttribute('aria-pressed','true');
 await reviews.getByRole('button',{name:'Clear review filters',exact:true}).click();
 await expect(reviews.getByRole('button',{name:'Show 2-star reviews',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(reviews.getByRole('button',{name:'Clear review filters',exact:true})).toHaveCount(0);
 await page.locator('.product-review-links').getByRole('button',{name:'Write a review',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Share your experience',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('radio')).toHaveCount(5);
 await expect(dialog.locator('input[type=radio]:checked')).toHaveCount(0);
 await expect(dialog.getByText('All ratings are welcome.',{exact:false})).toBeVisible();
 const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();
 expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(1440);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(1000);
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 fs.mkdirSync(path.resolve('../../work'),{recursive:true});
 await page.screenshot({path:path.resolve('../../work/review-dialog-desktop.png')});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('customer review mobile form deliberately accepts a low rating without publishing it',async({page})=>{
 const {db}=await import('../lib/db');
 const email='browser-review-'+randomUUID()+'@example.test',title='Scoped browser review '+randomUUID();
 const before=await db.review.findMany({where:{productId:first.id,status:'APPROVED',isDemo:false},select:{id:true,rating:true},orderBy:{id:'asc'}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/products/'+first.slug);
  const ratingBefore=await page.locator('.read-product-reviews').innerText();
  await page.locator('.product-review-links').getByRole('button',{name:'Write a review',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Share your experience',exact:true});
  await expect(dialog).toBeVisible();await expect(dialog.locator('input[type=radio]:checked')).toHaveCount(0);
  const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  fs.mkdirSync(path.resolve('../../work'),{recursive:true});
  await page.screenshot({path:path.resolve('../../work/review-dialog-mobile.png')});
  await dialog.getByLabel('Name',{exact:true}).fill('Scoped Browser Check');
  await dialog.getByLabel('Email',{exact:true}).fill(email);
  await dialog.getByLabel('Review title',{exact:true}).fill(title);
  await dialog.getByLabel('Your experience',{exact:true}).fill('Isolated browser workflow check. This pending entry is removed after the test.');
  const attempts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/reviews')attempts.push(request.url());});
  await dialog.getByRole('button',{name:'Submit review',exact:true}).click();
  expect(attempts).toHaveLength(0);
  expect(await dialog.getByRole('radio',{name:'1 star',exact:true}).evaluate(input=>(input as HTMLInputElement).validity.valueMissing)).toBe(true);
  await dialog.getByRole('radio',{name:'2 stars',exact:true}).check();
  await expect(dialog.getByRole('radio',{name:'2 stars',exact:true})).toBeChecked();
  const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/reviews'&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Submit review',exact:true}).click();
  expect((await response).status()).toBe(200);
  await expect(dialog.getByRole('status')).toContainText('Your review has been submitted');
  expect(attempts).toHaveLength(1);
  const saved=await db.review.findFirstOrThrow({where:{productId:first.id,email}});
  expect(saved.rating).toBe(2);expect(saved.status).toBe('PENDING');expect(saved.isDemo).toBe(false);expect(saved.verifiedPurchase).toBe(false);
  await page.keyboard.press('Escape');await page.reload();
  await expect(page.locator('.read-product-reviews')).toHaveText(ratingBefore);
  await page.getByRole('button',{name:'Read customer reviews',exact:true}).click();
  await expect(page.getByRole('region',{name:'Customer reviews',exact:true}).getByText(title,{exact:true})).toHaveCount(0);
  await expect(page.getByText(email,{exact:true})).toHaveCount(0);
  expect(await db.review.findMany({where:{productId:first.id,status:'APPROVED',isDemo:false},select:{id:true,rating:true},orderBy:{id:'asc'}})).toEqual(before);
  expect(errors).toEqual([]);
 }finally{
  await db.review.deleteMany({where:{productId:first.id,email}});
  await db.rateLimit.deleteMany({where:{key:createHash('sha256').update('review:'+email).digest('hex')}});
  await db.$disconnect();
 }
});
