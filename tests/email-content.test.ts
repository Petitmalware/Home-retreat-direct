import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderEmailContent} from '../lib/email-content';
test('branded email escapes customer text and keeps unpaid totals honest',()=>{
 const order={number:'TEST-EMAIL',createdAt:new Date(),isDemo:false,status:'AWAITING_REVIEW',subtotalCents:24900,totalCents:24900,shippingCents:null,taxCents:null,email:'customer@example.test',shippingAddress:{firstName:'Test',lastName:'Customer',line1:'1 Test St',line2:null,city:'Test',state:'IN',postalCode:'46204'},items:[{productName:'Chair <script>alert(1)</script>',variantName:'Stone & cream',quantity:1,unitPriceCents:24900}],payments:[]};
 const content=renderEmailContent('Order confirmation','Thank you <img src=x onerror=alert(1)>\nView: https://example.test/orders/TEST',{name:'Home Retreat Direct'},order);
 assert(content.html.includes('&lt;script&gt;'));assert(!content.html.includes('<script>'));assert(!content.html.includes('<img src=x'));assert(content.html.includes('href="https://example.test/orders/TEST"'));assert(content.text.includes('Subtotal before shipping and tax: $249.00'));assert(!content.text.includes('Payment received'));assert(!content.html.includes('DEVELOPMENT'));assert(content.attachments.length===0);
});
