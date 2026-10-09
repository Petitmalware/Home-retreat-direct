import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedCatalog,type CatalogProduct} from '../lib/catalog';
import {assetUrl,organizationSchema,pageMetadata,productSchema,publicOrigin,serializeJsonLd,siteUrl} from '../lib/seo';

test('SEO URLs use one explicit origin and collapse queries and trailing slashes',()=>{
 assert.equal(publicOrigin('https://shop.example.test/'),'https://shop.example.test');
 for(const origin of ['javascript:alert(1)','https://user:pass@shop.example.test','https://shop.example.test/path','https://shop.example.test/?query=1'])assert.throws(()=>publicOrigin(origin));
 assert.equal(siteUrl('/products/example/?utm_source=email#details'),publicOrigin()+'/products/example');
 for(const path of ['https://other.example.test','//other.example.test','/\\other.example.test'])assert.throws(()=>siteUrl(path));
 assert.equal(assetUrl('javascript:alert(1)'),undefined);
 const metadata=pageMetadata({title:'A Test Page',description:'A descriptive test page.',path:'/test?sort=price'});
 assert.deepEqual(metadata.alternates,{canonical:siteUrl('/test')});
 assert.deepEqual(metadata.robots,{index:true,follow:true});
 assert.deepEqual(pageMetadata({title:'Private test',description:'Private test.',path:'/account',index:false,follow:false}).robots,{index:false,follow:false});
});

test('Organization emits only configured public business facts',()=>{
 const config={storeName:'TEST ONLY Store',logoUrl:'',supportEmail:'',phone:'',socialInstagram:'',socialFacebook:''};
 const schema=organizationSchema(config);
 assert.equal(schema.name,config.storeName);assert.equal(schema.url,siteUrl('/'));
 for(const key of ['logo','email','telephone','sameAs','address','aggregateRating'])assert.equal(key in schema,false);
 const configured=organizationSchema({...config,logoUrl:'/images/logo.png',socialInstagram:'https://social.example.test/store',socialFacebook:'javascript:alert(1)'});
 assert.equal(configured.logo,assetUrl('/images/logo.png'));
 assert.deepEqual(configured.sameAs,['https://social.example.test/store']);
});

const fixture:CatalogProduct={...seedCatalog[0],name:'TEST ONLY schema fixture',isDemo:false,previewOnly:false,stockStatus:'Special Order',reviewCount:0,rating:0,price:99,image:'/images/test.jpg',images:['/images/test.jpg'],variants:[{id:'test-a',name:'A',color:'A',colorHex:'#fff',size:'TEST',price:99,stock:0},{id:'test-b',name:'B',color:'B',colorHex:'#000',size:'TEST',price:199.15,stock:0}],gallery:[{url:'/images/test.jpg',alt:'TEST ONLY',kind:'PRODUCT',variantId:'test-b'}]};

test('Product offer matches the displayed default finish and avoids invented stock or ratings',()=>{
 const schema=productSchema(fixture);
 assert.equal(schema.offers?.price,'199.15');assert.equal(schema.offers?.priceCurrency,'USD');
 assert.equal(schema.offers?.url,siteUrl('/products/'+fixture.slug));
 assert.equal('availability' in schema.offers!,false);assert.equal('aggregateRating' in schema,false);
 assert.deepEqual(schema.image,[assetUrl('/images/test.jpg')]);
 assert.equal(productSchema({...fixture,stockStatus:'Out of Stock'}).offers?.availability,'https://schema.org/OutOfStock');
 for(const entry of [{...fixture,isDemo:true},{...fixture,previewOnly:true},{...fixture,variants:[]}])assert.equal('offers' in productSchema(entry),false);
 assert.equal('aggregateRating' in productSchema({...fixture,isDemo:true,reviewCount:3,rating:5}),false);
 assert.equal('aggregateRating' in productSchema({...fixture,reviewCount:3,rating:NaN}),false);
});

test('JSON-LD serialization prevents HTML script breakout without changing fact values',()=>{
 const body={description:'A test </script><script>alert(1)</script> with line\u2028separator.'};
 const encoded=serializeJsonLd(body);assert.equal(encoded.includes('<'),false);assert.deepEqual(JSON.parse(encoded),body);
});
