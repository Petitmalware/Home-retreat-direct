/** Apply a product sale to its regular variant price using integer cents. */
export function sellingPriceCents(regularCents:number,discountPercent=0){
 if(!Number.isSafeInteger(regularCents)||regularCents<0)throw new RangeError('Invalid regular price.');
 if(!Number.isInteger(discountPercent)||discountPercent<0||discountPercent>90)throw new RangeError('Discount must be a whole percentage from 0 to 90.');
 return regularCents===0?0:Math.max(1,Math.round(regularCents*(100-discountPercent)/100));
}
