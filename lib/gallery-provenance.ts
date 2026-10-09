import manifest from '@/data/product-galleries.json';
export type SourcedGallery={
 id:string;slug:string;asin:string;category:string;name:string;brand:string;model:string;
 description:string;material:string;dimensions:string;weight:string;color:string;colorHex:string;
 features:string[];included:string[];specifications:{label:string;value:string}[];
 priceCents?:number;discountPercent?:number;sku?:string;pricingBasis?:string;
 stockStatus?:string;deliveryType?:string;deliveryWindow?:string;warranty?:string;assembly?:string;care?:string;shippingWeight?:string;
 reuseStatus?:string;
 variants?:{name:string;color:string;colorHex:string;sku:string;priceCents:number}[];
 galleryColorNote?:string;galleryNote?:string;
 credit:string;source:string;license:string;licenseUrl:string;changes:string;
 images:{url:string;alt:string;kind:string;color?:string;source:string;imageId:string;width:number;height:number;sha256:string}[];
};
export const sourcedGalleries=manifest.products as SourcedGallery[];
export const sourcedGalleryIds=sourcedGalleries.map(p=>p.id);
