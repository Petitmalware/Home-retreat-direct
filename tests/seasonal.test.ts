import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeason,seasonActive,seasonSchema,seasonalProductVisible,christmasCategorySlugs} from '../lib/seasonal';
import {variantAvailable} from '../lib/variant-availability';
import {productVideoUrl} from '../lib/product-video';

test('a missing or malformed seasonal setting hides the range; manual on/off overrides dates',()=>{
 assert.equal(seasonActive(parseSeason(null)),false);
 assert.equal(seasonActive(parseSeason('{"mode":"on","extra":true}')),false);
 assert.equal(seasonActive({mode:'on',startsOn:'2020-01-01',endsOn:'2020-01-02'}),true);
 assert.equal(seasonActive({mode:'off',startsOn:'2026-10-01',endsOn:'2026-12-31'}),false);
});
test('scheduled visibility includes the whole last day in Eastern Time and handles daylight saving',()=>{
 const setting=seasonSchema.parse({mode:'scheduled',startsOn:'2026-11-01',endsOn:'2026-12-26'});
 assert.equal(seasonActive(setting,new Date('2026-11-01T03:59:59Z')),false);
 assert.equal(seasonActive(setting,new Date('2026-11-01T04:00:00Z')),true);
 assert.equal(seasonActive(setting,new Date('2026-12-27T04:59:59Z')),true);
 assert.equal(seasonActive(setting,new Date('2026-12-27T05:00:00Z')),false);
 assert.equal(seasonSchema.safeParse({mode:'scheduled',startsOn:'2026-02-30',endsOn:'2026-12-26'}).success,false);
 assert.equal(seasonSchema.safeParse({mode:'scheduled',startsOn:'9999-99-99',endsOn:''}).success,false);
 assert.equal(seasonSchema.safeParse({mode:'scheduled',startsOn:'2026-12-26',endsOn:'2026-11-01'}).success,false);
});
test('hidden seasonal variants cannot be bought through collection or category membership',()=>{
 const plain={status:'ACTIVE',stockStatus:'Special Order',isDemo:false};
 assert.equal(variantAvailable({active:true,product:plain},false),true);
 for(const membership of [{collections:[{collection:{slug:'christmas'}}]},{categories:[{category:{group:'Christmas',slug:'custom-christmas-category'}}]},...christmasCategorySlugs.map(slug=>({categories:[{category:{group:'Staff custom group',slug}}]}))]){
  const product={...plain,...membership};assert.equal(seasonalProductVisible(product,false),false);
  assert.equal(variantAvailable({active:true,product},false),false);
  assert.equal(variantAvailable({active:true,product},true),true);
 }
 assert.equal(variantAvailable({active:false,product:plain},true),false);
});
test('only supported HTTPS product videos can render or be saved',()=>{
 for(const url of ['https://cdn1.costway.com/media/us/Install_video/48265971.mp4','https://cdn1.costway.com/Display+video/CM22830.mp4','https://hooya.s3.us-west-1.amazonaws.com/Display+video/CM23510.mp4','https://res.cloudinary.com/store/video/upload/tree.mp4'])assert(productVideoUrl(url));
 for(const url of ['javascript:alert(1)','http://cdn1.costway.com/Display+video/CM22830.mp4','https://cdn1.costway.com.attacker.test/tree.mp4','https://user:password@cdn1.costway.com/Display+video/CM22830.mp4','https://cdn1.costway.com/media/us/reviewvideo/customer.mp4','https://res.cloudinary.com/store/image/upload/photo.jpg'])assert.equal(productVideoUrl(url),null);
});
