import type {CatalogProduct} from './catalog';

export function initialVariant(product:CatalogProduct){
 const primary=product.gallery?.find(image=>image.url===product.image);
 return product.variants.find(variant=>variant.id===primary?.variantId)??product.variants[0];
}

export function variantPhotograph(product:CatalogProduct,variantId?:string){
 return product.gallery?.find(image=>image.variantId===variantId&&image.kind!=='DIMENSIONS');
}
