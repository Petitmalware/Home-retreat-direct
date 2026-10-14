import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import type {InvoiceData,DocumentAddress} from './invoice';

export type OrderDocumentKind='ORDER_CONFIRMATION'|'INVOICE'|'RECEIPT';
export type DocumentBusiness={name:string;address?:string;supportEmail?:string;phone?:string};
export type OrderDocumentAttachment={filename:string;content:Buffer;contentType:'application/pdf'};

const dollars=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const printable=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[′’]/g,"'").replace(/[″“”]/g,'"').replace(/[–—]/g,'-').replace(/×/g,'x').replace(/[^\x20-\x7e\n]/g,' ');
const date=(value:Date|string)=>{
 const parsed=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(parsed.getTime()))throw new Error('Order document has an invalid date.');
 return parsed.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
};
const labels:Record<OrderDocumentKind,string>={ORDER_CONFIRMATION:'Order confirmation',INVOICE:'Invoice',RECEIPT:'Payment receipt'};
export const orderDocumentReference=(kind:OrderDocumentKind,number:string)=>`${kind==='INVOICE'?'INV':kind==='RECEIPT'?'RCT':'ORD'}-${number}`;

export function orderDocumentSummary(order:InvoiceData){
 const finalized=order.shippingCents!==null&&order.taxCents!==null&&order.shippingConfirmed!==false&&order.taxConfirmed!==false;
 const confirmedCents=order.payments.filter(payment=>payment.status==='CONFIRMED').reduce((total,payment)=>total+payment.amountReceivedCents,0);
 const refundedCents=order.payments.filter(payment=>payment.status==='REFUNDED').reduce((total,payment)=>total+payment.amountReceivedCents,0);
 const receivedCents=confirmedCents+refundedCents;
 return {finalized,confirmedCents,refundedCents,receivedCents,balanceDueCents:Math.max(0,order.totalCents-receivedCents),paid:finalized&&order.totalCents>0&&receivedCents>=order.totalCents};
}

export function defaultOrderDocumentKind(order:InvoiceData):OrderDocumentKind{
 const summary=orderDocumentSummary(order);
 if(summary.paid)return 'RECEIPT';
 return summary.finalized?'INVOICE':'ORDER_CONFIRMATION';
}

export function orderDocumentFilename(kind:OrderDocumentKind,number:string){
 const safeNumber=number.replace(/[^A-Za-z0-9_-]/g,'-').slice(0,80)||'order';
 return `${safeNumber}-${kind==='RECEIPT'?'receipt':kind==='INVOICE'?'invoice':'confirmation'}.pdf`;
}

function validate(order:InvoiceData,kind:OrderDocumentKind){
 const cents=[order.subtotalCents,order.totalCents,order.shippingCents??0,order.taxCents??0,...order.items.map(item=>item.unitPriceCents),...order.payments.map(payment=>payment.amountReceivedCents)];
 if(cents.some(value=>!Number.isSafeInteger(value)||value<0)||!order.items.length||order.items.some(item=>!Number.isSafeInteger(item.quantity)||item.quantity<1))throw new Error('Order document contains invalid amounts or quantities.');
 const subtotal=order.items.reduce((total,item)=>total+item.quantity*item.unitPriceCents,0);
 if(subtotal!==order.subtotalCents||subtotal+(order.shippingCents??0)+(order.taxCents??0)!==order.totalCents)throw new Error('Order document totals do not match its saved line items.');
 const summary=orderDocumentSummary(order);
 if(!Number.isSafeInteger(summary.receivedCents))throw new Error('Order document contains an invalid received payment total.');
 if(kind==='INVOICE'&&!summary.finalized)throw new Error('Confirm shipping and tax before preparing an invoice.');
 if(kind==='RECEIPT'&&!summary.paid)throw new Error('A receipt is available only after the full approved payment is confirmed.');
}

/** Documents use saved order prices, never the current catalog or discount settings. */
export async function orderDocumentPDF(order:InvoiceData,business:DocumentBusiness,kind:OrderDocumentKind):Promise<Uint8Array>{
 validate(order,kind);
 const summary=orderDocumentSummary(order),pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),display=await pdf.embedFont(StandardFonts.TimesRoman);
 const ink=rgb(.16,.21,.17),muted=rgb(.4,.45,.41),rule=rgb(.85,.88,.84),wash=rgb(.96,.97,.95);
 const left=48,right=564,width=right-left,bottom=62;
 let page!:PDFPage;let y=0;
 const write=(value:string,x:number,atY:number,size=10,font:PDFFont=regular,color=ink)=>page.drawText(printable(value),{x,y:atY,size,font,color});
 const rightText=(value:string,atX:number,atY:number,size=10,font:PDFFont=regular,color=ink)=>{const text=printable(value);write(text,atX-font.widthOfTextAtSize(text,size),atY,size,font,color)};
 const wrap=(value:string,maxWidth:number,size=10,font:PDFFont=regular)=>{
  const lines:string[]=[];
  for(const paragraph of printable(value).split('\n')){
   let line='';
   for(const word of paragraph.trim().split(/\s+/).filter(Boolean)){
    if(font.widthOfTextAtSize(word,size)>maxWidth){
     if(line){lines.push(line);line='';}
     let part='';for(const character of word){if(font.widthOfTextAtSize(part+character,size)>maxWidth&&part){lines.push(part);part='';}part+=character;}line=part;
    }else if(line&&font.widthOfTextAtSize(line+' '+word,size)>maxWidth){lines.push(line);line=word;}else line+=(line?' ':'')+word;
   }
   if(line)lines.push(line);else if(!paragraph.trim())lines.push('');
  }
  return lines;
 };
 function newPage(){
  page=pdf.addPage([612,792]);
  page.drawRectangle({x:0,y:700,width:612,height:92,color:ink});
  const brand=wrap(business.name||'Home Retreat Direct',width,18,bold);
  brand.slice(0,2).forEach((line,index)=>write(line,left,754-index*22,18,bold,rgb(1,1,1)));
  write([business.supportEmail,business.phone].filter(Boolean).join('  |  '),left,718,9,regular,rgb(.86,.9,.84));
  write(labels[kind],left,664,28,display);
  rightText(summary.refundedCents?'REFUND RECORDED':kind==='RECEIPT'?'PAYMENT CONFIRMED':summary.paid?'PAID':kind==='INVOICE'?'PAYMENT DUE':'ORDER RECEIVED',right,669,9,bold,muted);
  write(orderDocumentReference(kind,order.number),left,640,9,bold);
  rightText('Order date: '+date(order.createdAt),right,640,9,regular,muted);
  y=624;page.drawLine({start:{x:left,y},end:{x:right,y},thickness:1,color:rule});y-=24;
 }
 function ensure(height:number){if(y-height<bottom)newPage();}
 function paragraph(value:string,size=10,color=ink,space=8){
  const lines=wrap(value,width,size);for(const line of lines){ensure(size+5);write(line,left,y,size,regular,color);y-=size+5;}y-=space;
 }
 function section(value:string){ensure(30);write(value.toUpperCase(),left,y,10,bold,muted);y-=20;}
 function addressLines(address:DocumentAddress){return [address.firstName+' '+address.lastName,address.line1,...(address.line2?[address.line2]:[]),address.city+', '+address.state+' '+address.postalCode,...(address.country&&address.country!=='US'?[address.country]:[])];}
 newPage();
 const contact=[business.address].filter((value):value is string=>!!value?.trim());
 for(const value of contact)paragraph(value,9,muted,2);
 if(contact.length)y-=7;
 const shipping=addressLines(order.shippingAddress).flatMap(value=>wrap(value,246,10));
 const billing=addressLines(order.billingAddress??order.shippingAddress).flatMap(value=>wrap(value,246,10));
 const addressHeight=30+Math.max(shipping.length,billing.length)*15;
 ensure(addressHeight+40);
 write('BILL TO',left,y,9,bold,muted);write('DELIVER TO',318,y,9,bold,muted);y-=20;
 const addressTop=y;
 billing.forEach((value,index)=>write(value,left,addressTop-index*15));shipping.forEach((value,index)=>write(value,318,addressTop-index*15));
 y-=Math.max(shipping.length,billing.length)*15+4;
 paragraph(order.email,10,muted,14);
 function tableHeader(){
  ensure(38);page.drawRectangle({x:left,y:y-9,width,height:27,color:wash});
  write('ITEM',left+8,y,9,bold,muted);rightText('QTY',365,y,9,bold,muted);rightText('UNIT PRICE',457,y,9,bold,muted);rightText('AMOUNT',right-8,y,9,bold,muted);y-=31;
 }
 tableHeader();
 for(const item of order.items){
  const name=wrap(item.productName,280,10,bold),variant=item.variantName?wrap(item.variantName,280,9):[],sku=item.sku?wrap('SKU: '+item.sku,280,8):[];
  const details=[...name.map(value=>({value,size:10,font:bold,color:ink})),...variant.map(value=>({value,size:9,font:regular,color:muted})),...sku.map(value=>({value,size:8,font:regular,color:muted}))];
  const height=Math.max(36,details.reduce((sum,detail)=>sum+detail.size+5,0)+13);
  if(y-height<bottom){newPage();tableHeader();}
  const rowTop=y;let detailY=rowTop,continued=false;
  rightText(String(item.quantity),365,rowTop,10);rightText(dollars(item.unitPriceCents),457,rowTop,10);rightText(dollars(item.quantity*item.unitPriceCents),right-8,rowTop,10,bold);
  for(const detail of details){if(detailY-detail.size<bottom){newPage();tableHeader();detailY=y;continued=true;}write(detail.value,left+8,detailY,detail.size,detail.font,detail.color);detailY-=detail.size+5;}
  y=continued?detailY-13:Math.min(rowTop-height,detailY-13);page.drawLine({start:{x:left,y:y+7},end:{x:right,y:y+7},thickness:.5,color:rule});y-=10;
 }
 y-=12;ensure(205);
 const totalLine=(label:string,value:string,strong=false)=>{
  if(strong)page.drawRectangle({x:306,y:y-9,width:258,height:26,color:wash});
  write(label,318,y,strong?11:10,strong?bold:regular,strong?ink:muted);rightText(value,right-10,y,strong?13:10,strong?bold:regular);y-=strong?36:20;
 };
 totalLine('Item subtotal',dollars(order.subtotalCents));
 totalLine('Shipping',summary.finalized?dollars(order.shippingCents!):'To be confirmed');
 totalLine('Tax',summary.finalized?dollars(order.taxCents!):'To be confirmed');
 if(summary.finalized){
  totalLine('Order total (USD)',dollars(order.totalCents),true);
  totalLine('Payment received',dollars(summary.receivedCents));
  if(summary.refundedCents)totalLine('Refund recorded',dollars(summary.refundedCents));
  totalLine('Amount due (USD)',dollars(summary.balanceDueCents),true);
 }else totalLine('Item total (USD)',dollars(order.subtotalCents),true);
 y-=8;
 if(kind==='RECEIPT'){
  section('Payment confirmed');
  paragraph('Thank you for your payment. Keep this receipt for your records.'+(summary.refundedCents?' A refund has subsequently been recorded; see the refund amount above.':''));
  for(const payment of order.payments.filter(value=>['CONFIRMED','REFUNDED'].includes(value.status))){
   const details=[dollars(payment.amountReceivedCents),payment.receivedAt?'Received '+date(payment.receivedAt):'',payment.method?.name??'',payment.reference?'Payment reference: '+payment.reference:'',payment.status==='REFUNDED'?'Subsequently refunded':''].filter(Boolean);
   paragraph(details.join(' | '),9,muted,4);
  }
 }else if(kind==='INVOICE'){
  section('Payment information');
  paragraph(summary.refundedCents?'Payment was received and a refund has subsequently been recorded.':summary.paid?'Payment has been confirmed.':'Please use the payment instructions provided separately by our team. This invoice shows the approved order charges; it does not confirm receipt of payment.');
 }else{
  section('Your order');
  const paymentNote=summary.refundedCents?'Payment was received and a refund has subsequently been recorded.':summary.paid?'Your payment was confirmed. A payment receipt is available separately.':summary.receivedCents?'Payment received to date: '+dollars(summary.receivedCents)+'.':'Payment has not been confirmed.';
  paragraph('Thank you for your order. Your selected items and saved order details are listed above. '+paymentNote+(!summary.finalized?' Availability, delivery eligibility, shipping and tax must be confirmed before final payment instructions are provided.':''));
 }
 paragraph('Order status: '+order.status.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,value=>value.toUpperCase()),9,muted,3);
 if(business.supportEmail)paragraph('Questions about this order? '+business.supportEmail,9,muted,0);
 const pages=pdf.getPages();pages.forEach((current,index)=>{
  current.drawLine({start:{x:left,y:45},end:{x:right,y:45},thickness:.5,color:rule});
  current.drawText(printable(order.number+' | '+labels[kind]),{x:left,y:30,size:8,font:regular,color:muted});
  const text=`Page ${index+1} of ${pages.length}`;current.drawText(text,{x:right-regular.widthOfTextAtSize(text,8),y:30,size:8,font:regular,color:muted});
 });
 pdf.setTitle(labels[kind]+' '+order.number);pdf.setAuthor(business.name||'Home Retreat Direct');pdf.setSubject(labels[kind]+' for saved order '+order.number);pdf.setCreator('Home Retreat Direct');pdf.setLanguage('en-US');
 return pdf.save();
}

export async function orderDocumentAttachment(order:InvoiceData,business:DocumentBusiness,kind:OrderDocumentKind):Promise<OrderDocumentAttachment>{
 return {filename:orderDocumentFilename(kind,order.number),content:Buffer.from(await orderDocumentPDF(order,business,kind)),contentType:'application/pdf'};
}
