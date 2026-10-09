import {defaultOrderDocumentKind,orderDocumentPDF,type DocumentBusiness} from './order-documents';

export type DocumentAddress={firstName:string;lastName:string;line1:string;line2:string|null;city:string;state:string;postalCode:string;country?:string};
export type InvoiceData={
 number:string;createdAt:Date|string;isDemo:boolean;status:string;
 subtotalCents:number;shippingCents:number|null;taxCents:number|null;totalCents:number;
 shippingConfirmed?:boolean;taxConfirmed?:boolean;email:string;
 shippingAddress:DocumentAddress;billingAddress?:DocumentAddress;
 items:{productName:string;variantName:string;sku?:string;quantity:number;unitPriceCents:number}[];
 payments:{status:string;amountReceivedCents:number;receivedAt:Date|string|null;reference?:string|null;method?:{name:string}|null}[];
};

/** Keep the original invoice download endpoint compatible with customer orders. */
export async function invoicePDF(order:InvoiceData,business:DocumentBusiness){
 return orderDocumentPDF(order,business,defaultOrderDocumentKind(order));
}
