type SellableVariant={active:boolean;product:{status:string;stockStatus:string;isDemo:boolean}};

export function variantAvailable(variant:SellableVariant|null|undefined):boolean{
 return !!variant?.active&&variant.product.status==='ACTIVE'&&variant.product.stockStatus!=='Out of Stock'&&(process.env.DEVELOPMENT_CATALOG==='true'||!variant.product.isDemo);
}
