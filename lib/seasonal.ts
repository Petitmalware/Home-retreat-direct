import {z} from 'zod';
export const CHRISTMAS_COLLECTION='christmas';
export const CHRISTMAS_SETTING='christmasSeason';
export const SEASON_TIME_ZONE='America/New_York';
export const christmasCategories=[
 {slug:'christmas-trees',name:'Christmas Trees',group:'Christmas',intro:'Find the tree that makes the season feel like home.'},
 {slug:'christmas-unlit-trees',name:'Unlit & Undecorated Trees',group:'Christmas',intro:'Plain green artificial trees, ready for your own lights and ornaments.'},
 {slug:'christmas-toys-gifts',name:'Kids’ Toys & Gifts',group:'Christmas',intro:'Ride-on adventures, backyard playsets and gifts made for play.'},
 {slug:'christmas-wreaths-garlands',name:'Wreaths & Garlands',group:'Christmas',intro:'A welcoming door. A beautifully dressed mantel.'},
 {slug:'christmas-outdoor-decor',name:'Christmas Lights & Outdoor Décor',group:'Christmas',intro:'Bring a little Christmas magic to your porch and garden.'},
] as const;
export const christmasCategorySlugs=christmasCategories.map(category=>category.slug);
const date=z.string().refine(value=>value===''||/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,'Choose a valid date.');
export const seasonSchema=z.object({mode:z.enum(['on','off','scheduled']),startsOn:date.default(''),endsOn:date.default('')}).strict().superRefine((value,ctx)=>{
 if(value.mode==='scheduled'&&(!value.startsOn||!value.endsOn||value.endsOn<value.startsOn))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Choose a start date and an end date on or after it.',path:['endsOn']});
});
export type SeasonSettings=z.infer<typeof seasonSchema>;
export function parseSeason(value:string|undefined|null):SeasonSettings{
 try{const result=seasonSchema.safeParse(JSON.parse(value??''));if(result.success)return result.data;}catch{}
 return {mode:'off',startsOn:'',endsOn:''};
}
export function seasonActive(settings:SeasonSettings,now=new Date()):boolean{
 if(settings.mode==='on')return true;
 if(settings.mode!=='scheduled'||!settings.startsOn||!settings.endsOn)return false;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:SEASON_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>parts.find(part=>part.type===type)?.value;
 const today=value('year')+'-'+value('month')+'-'+value('day');
 return today>=settings.startsOn&&today<=settings.endsOn;
}
export function christmasCategory(slug:string){return christmasCategories.some(category=>category.slug===slug);}
export type SeasonalMembership={collections?:{collection?:{slug:string};collectionId?:string}[];categories?:{category?:{group?:string;slug?:string}}[]};
export function seasonalProductVisible(product:SeasonalMembership,active:boolean){
 return active||(!product.collections?.some(link=>link.collection?.slug===CHRISTMAS_COLLECTION||link.collectionId===CHRISTMAS_COLLECTION)&&!product.categories?.some(link=>link.category?.group==='Christmas'||christmasCategory(link.category?.slug??'')));
}
