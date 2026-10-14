import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderEmailContent} from '../lib/email-content';
test('branded email escapes customer text and keeps unpaid totals honest',()=>{
 const order={number:'TEST-EMAIL',createdAt:new Date(),isDemo:false,status:'AWAITING_REVIEW',subtotalCents:24900,totalCents:24900,shippingCents:null,taxCents:null,email:'customer@example.test',shippingAddress:{firstName:'Test',lastName:'Customer',line1:'1 Test St',line2:null,city:'Test',state:'IN',postalCode:'46204'},items:[{productName:'Chair <script>alert(1)</script>',variantName:'Stone & cream',quantity:1,unitPriceCents:24900}],payments:[]};
 const content=renderEmailContent('Order confirmation','Thank you <img src=x onerror=alert(1)>\nView: https://example.test/orders/TEST',{name:'Home Retreat Direct'},order);
 assert(content.html.includes('&lt;script&gt;'));assert(!content.html.includes('<script>'));assert(!content.html.includes('<img src=x'));assert(content.html.includes('href="https://example.test/orders/TEST"'));assert(content.text.includes('Subtotal before shipping and tax: $249.00'));assert(!content.text.includes('Payment received'));assert(!content.html.includes('DEVELOPMENT'));assert(content.attachments.length===0);
});

test('financial email shows the saved total, actual payment reference and subsequent refunds',()=>{
 const order={number:'HR-26-EMAIL',createdAt:'2026-10-08T00:30:00Z',isDemo:false,status:'APPROVED',subtotalCents:25000,totalCents:29900,shippingCents:3500,taxCents:1400,shippingConfirmed:true,taxConfirmed:true,email:'customer@example.test',shippingAddress:{firstName:'Alex',lastName:'Morgan',line1:'1 Test St',line2:null,city:'Test',state:'IN',postalCode:'46204'},items:[{productName:'Test chair',variantName:'Stone',sku:'TEST-SKU',quantity:1,unitPriceCents:25000}],payments:[]};
 const business={name:'Home Retreat Direct',supportEmail:'orders@example.test'};
 const invoice=renderEmailContent('Your invoice','The approved invoice is attached.',business,order,[],{kind:'INVOICE',orderUrl:'https://example.test/orders/HR-26-EMAIL?token=private-token'});
 assert.match(invoice.text,/INV-HR-26-EMAIL/);assert.match(invoice.text,/Amount due: \$299\.00/);assert.match(invoice.html,/View your order/);
 assert.throws(()=>renderEmailContent('Receipt','Thanks',business,order,[],{kind:'RECEIPT'}),/full confirmed payment/);
 const paid={...order,payments:[{status:'CONFIRMED',amountReceivedCents:29900,receivedAt:'2026-10-09T12:00:00Z',reference:'BANK<&-123'}]};
 const receipt=renderEmailContent('Payment receipt','Thanks',business,paid,[],{kind:'RECEIPT'});
 assert.match(receipt.text,/Amount due: \$0\.00/);assert.match(receipt.html,/BANK&lt;&amp;-123/);assert.match(receipt.html,/Oct 9, 2026/);
 const refund=renderEmailContent('Payment receipt','Thanks',business,{...paid,status:'REFUNDED',payments:[{...paid.payments[0],status:'REFUNDED'}]},[],{kind:'RECEIPT'});
 assert.match(refund.html,/REFUND RECORDED/);assert.match(refund.text,/Refund recorded: \$299\.00/);
 const unsafe=renderEmailContent('Invoice','Thanks',business,order,[],{kind:'INVOICE',orderUrl:'javascript:alert(1)'});
 assert.doesNotMatch(unsafe.html,/javascript:|View your order/);
});
