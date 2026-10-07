import 'dotenv/config';import {test,expect} from '@playwright/test';
test('browse, filter, compare, select variants and review an unpaid checkout',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/collections/gazebos');await expect(page.locator('.product-card')).toHaveCount(12);await page.screenshot({path:'.sites-runtime/collection-desktop.png'});
 await page.getByRole('combobox',{name:'Sort products'}).click();await page.getByRole('option',{name:'Price: low to high'}).click();
 const prices=await page.locator('.card-price .price').allTextContents();expect(Number(prices[0].replace(/[^\d.]/g,''))).toBeLessThanOrEqual(Number(prices.at(-1)!.replace(/[^\d.]/g,'')));
 await page.getByRole('textbox',{name:'Search collection'}).fill('12x16');await expect(page.locator('.product-card')).toHaveCount(4);
 await page.getByRole('textbox',{name:'Search collection'}).fill('nonexistentxyz');await expect(page.locator('.product-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(page.locator('.product-card')).toHaveCount(12);
 await page.locator('.product-card .compare-check').nth(0).click();await page.locator('.product-card .compare-check').nth(1).click();await page.getByRole('link',{name:'Compare products',exact:true}).click();await expect(page.locator('.comparison-table')).toBeVisible();
 await page.goto('/products/aurelia-12-16-hardtop-gazebo');await page.screenshot({path:'.sites-runtime/product-desktop.png'});
 await page.getByRole('tab',{name:'Specifications',exact:true}).click();await expect(page.getByText('Roof material',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Reviews',exact:true}).click();await expect(page.getByText('DEMO DATA · NOT CUSTOMER EXPERIENCES',{exact:true})).toBeVisible();await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.locator('.variant-options button').nth(1).click();await expect(page.locator('.product-price')).toContainText('2,599');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/cart')&&r.request().method()==='POST'),page.getByRole('button',{name:'Add to bag',exact:true}).first().click()]);
 await page.goto('/checkout');await expect(page.getByText('Pending review',{exact:true}).first()).toBeVisible();await expect(page.getByRole('button',{name:'Submit order',exact:true})).toBeVisible();await expect(page.getByText('No card or bank details collected here.',{exact:true})).toBeVisible();await page.screenshot({path:'.sites-runtime/checkout-desktop.png'});expect(errors).toEqual([]);
});
test('mobile pages fit the viewport and all main collections render',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const route of ['/','/collections/massage-chairs','/products/aurelia-12-16-hardtop-gazebo','/cart','/checkout','/compare?ids=prd-gazebos-1,prd-gazebos-2','/track-order','/account']){
  await page.goto(route);await expect(page.locator('h1,h2').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth),route).toBe(390);await page.screenshot({path:'.sites-runtime/mobile-'+(route.split('/')[1]?.split('?')[0]||'home')+'.png'});
 }
 for(const slug of ['gazebos','patio-furniture','fire-pits','electric-fireplaces','premium-furniture','massage-chairs','saunas']){await page.goto('/collections/'+slug);await expect(page.locator('.product-card').first()).toBeVisible();}
});
test('owner dashboard and product image tools are accessible after secure login',async({page})=>{
 await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill(process.env.SEED_OWNER_EMAIL!);await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_OWNER_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.admin-content h1')).toBeVisible({timeout:60000});await page.screenshot({path:'.sites-runtime/admin-desktop.png'});
 for(const route of ['/admin/orders','/admin/products','/admin/reviews','/admin/policies','/admin/staff','/admin/settings','/admin/customers','/admin/audit','/admin/taxonomy']){await page.goto(route);await expect(page.locator('.admin-content h1')).toBeVisible();}
 await page.goto('/admin/products/prd-gazebos-1');await page.getByRole('tab',{name:'Images',exact:true}).click();await expect(page.getByRole('button',{name:'Save image changes',exact:true})).toBeVisible();await expect(page.locator('.image-editor-card')).toHaveCount(3);await page.screenshot({path:'.sites-runtime/admin-images.png'});
});
