import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sellingPriceCents} from '../lib/pricing';
test('sale prices round once in cents and preserve the regular price',()=>{
 assert.equal(sellingPriceCents(19999,15),16999);
 assert.equal(sellingPriceCents(19999,0),19999);
 assert.equal(sellingPriceCents(1,90),1);
 assert.equal(sellingPriceCents(0,50),0);
});
test('invalid discounts and prices cannot enter checkout',()=>{
 for(const percent of [-1,91,1.5,NaN])assert.throws(()=>sellingPriceCents(100,percent));
 for(const price of [-1,1.5,Infinity])assert.throws(()=>sellingPriceCents(price,10));
});
