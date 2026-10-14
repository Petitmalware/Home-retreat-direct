import {seasonalProductVisible,type SeasonalMembership} from './seasonal';
type SellableVariant={active:boolean;product:{status:string;stockStatus:string;isDemo:boolean}&SeasonalMembership};

export function variantAvailable(variant:SellableVariant|null|undefined,christmasActive=false):boolean{
 return !!variant?.active&&seasonalProductVisible(variant.product,christmasActive)&&variant.product.status==='ACTIVE'&&variant.product.stockStatus!=='Out of Stock'&&(process.env.DEVELOPMENT_CATALOG==='true'||!variant.product.isDemo);
}
