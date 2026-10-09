import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import type {InvoiceData} from '../lib/invoice';
import {defaultOrderDocumentKind,orderDocumentAttachment,orderDocumentFilename,orderDocumentPDF,orderDocumentSummary} from '../lib/order-documents';

const business={name:'Home Retreat Direct'};
const order=():InvoiceData=>({number:'HR-26-DOC123',createdAt:new Date('2026-10-08T00:30:00Z'),isDemo:false,status:'AWAITING_REVIEW',email:'customer@example.test',subtotalCents:24999,shippingCents:null,taxCents:null,totalCents:24999,shippingConfirmed:false,taxConfirmed:false,shippingAddress:{firstName:'Alex',lastName:'Morgan',line1:'100 Garden Lane',line2:null,city:'Indianapolis',state:'IN',postalCode:'46201'},items:[{productName:'Bagley Armless Chair Component',variantName:'Stone',sku:'HRD-CHAIR',quantity:1,unitPriceCents:24999}],payments:[]});
const approved=()=>({...order(),status:'APPROVED',shippingCents:4900,taxCents:2100,totalCents:31999,shippingConfirmed:true,taxConfirmed:true});

test('unapproved orders produce a confirmation and cannot produce an invoice or receipt',async()=>{
 const saved=order();assert.equal(defaultOrderDocumentKind(saved),'ORDER_CONFIRMATION');
 const pdf=await PDFDocument.load(await orderDocumentPDF(saved,business,'ORDER_CONFIRMATION'));
 assert.equal(pdf.getTitle(),'Order confirmation HR-26-DOC123');assert.equal(pdf.getPageCount(),1);
 await assert.rejects(orderDocumentPDF(saved,business,'INVOICE'),/shipping and tax/);
 await assert.rejects(orderDocumentPDF(saved,business,'RECEIPT'),/full approved payment/);
});

test('invoices keep saved line prices and receipts require confirmed payment',async()=>{
 const saved=approved();assert.equal(defaultOrderDocumentKind(saved),'INVOICE');
 const requested={...saved,payments:[{status:'REQUESTED',amountReceivedCents:saved.totalCents,receivedAt:null}]};
 await assert.rejects(orderDocumentPDF(requested,business,'RECEIPT'),/payment is confirmed/);
 const partial={...saved,payments:[{status:'CONFIRMED',amountReceivedCents:10000,receivedAt:new Date()}]};
 assert.equal(orderDocumentSummary(partial).balanceDueCents,21999);
 await assert.rejects(orderDocumentPDF(partial,business,'RECEIPT'),/payment is confirmed/);
 const paid={...saved,status:'PAYMENT_RECEIVED',payments:[{status:'CONFIRMED',amountReceivedCents:saved.totalCents,receivedAt:new Date(),reference:'BANK-123'}]};
 assert.equal(defaultOrderDocumentKind(paid),'RECEIPT');
 assert.equal((await PDFDocument.load(await orderDocumentPDF(paid,business,'ORDER_CONFIRMATION'))).getTitle(),'Order confirmation HR-26-DOC123');
 const attachment=await orderDocumentAttachment(paid,business,'RECEIPT');
 assert.equal(attachment.filename,'HR-26-DOC123-receipt.pdf');assert.equal(attachment.contentType,'application/pdf');assert.equal(attachment.content.subarray(0,5).toString(),'%PDF-');
 assert.equal((await PDFDocument.load(attachment.content)).getTitle(),'Payment receipt HR-26-DOC123');
});

test('refunded orders retain their historical receipt and expose the recorded refund',async()=>{
 const saved={...approved(),status:'REFUNDED',payments:[{status:'REFUNDED',amountReceivedCents:31999,receivedAt:'2026-10-08T01:00:00Z'}]};
 assert.deepEqual(orderDocumentSummary(saved),{finalized:true,confirmedCents:0,refundedCents:31999,receivedCents:31999,balanceDueCents:0,paid:true});
 assert.equal(defaultOrderDocumentKind(saved),'RECEIPT');
 assert.equal((await PDFDocument.load(await orderDocumentPDF(saved,business,'RECEIPT'))).getPageCount(),1);
});

test('inconsistent snapshots and unsafe amounts cannot become financial documents',async()=>{
 for(const saved of [{...approved(),totalCents:32000},{...approved(),subtotalCents:25000},{...approved(),items:[{...order().items[0],quantity:1.5}]},{...approved(),taxCents:-1},{...approved(),taxConfirmed:false}])await assert.rejects(orderDocumentPDF(saved,business,'INVOICE'));
 const filename=orderDocumentFilename('INVOICE','HR / ../../ bad\r\n');
 assert.doesNotMatch(filename,/[/\\\r\n]/);assert.ok(filename.endsWith('-invoice.pdf'));
});

test('large orders paginate with valid letter-sized pages',async()=>{
 const items=Array.from({length:42},(_,index)=>({productName:`Garden piece ${index+1}: a generously proportioned outdoor lounge chair with weather-resistant cushions and carefully considered detail`,variantName:'Natural finish / Four-piece configuration',sku:'HRD-PIECE-'+index,quantity:2,unitPriceCents:12345}));
 const subtotalCents=items.reduce((sum,item)=>sum+item.quantity*item.unitPriceCents,0);
 const saved={...approved(),items,subtotalCents,totalCents:subtotalCents+7000};
 const pdf=await PDFDocument.load(await orderDocumentPDF(saved,{...business,address:'45 Market Street, Suite 200\nIndianapolis, IN 46201',supportEmail:'orders@example.test'},'INVOICE'));
 assert.ok(pdf.getPageCount()>3);
 for(const page of pdf.getPages())assert.deepEqual(page.getSize(),{width:612,height:792});
});
