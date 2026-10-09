'use client';
import {useMemo,useState} from 'react';import Link from 'next/link';import {Search,SlidersHorizontal} from 'lucide-react';import {Checkbox} from '@/components/ui/checkbox';import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';import {Slider} from '@/components/ui/slider';import {ProductCard,CompareTray} from './card';import {categories,type CatalogProduct} from '@/lib/catalog';
type Props={products:CatalogProduct[];title:string;intro?:string;query?:string;category?:string};
const massageComfortOptions=[
 {value:'4d',label:'Premium 4D technology',pattern:/\b4d\b/},
 {value:'3d',label:'Adjustable 3D massage',pattern:/\b3d\b/},
 {value:'sl-track',label:'SL-track comfort',pattern:/\bsl(?:\s+style)?\s*track\b/},
 {value:'lumbar-heat',label:'Lumbar warmth',pattern:/\blumbar\b.*\b(?:heat|heated|heating|warmth)\b|\b(?:heat|heated|heating|warmth)\b.*\blumbar\b/},
 {value:'zero-gravity',label:'Zero-gravity recline',pattern:/\bzero\s*gravity\b/},
];
function matchesMassageComfort(product:CatalogProduct,value:string){
 const option=massageComfortOptions.find(option=>option.value===value);
 if(!option)return false;
 return [...product.features,...product.specs.map(spec=>spec.label+' '+spec.value)].some(fact=>option.pattern.test(fact.normalize('NFKC').toLowerCase().replace(/[-–—‑_]/g,' ')));
}
export function Listing({products,title,intro,query='',category='all'}:Props){
 const[sort,setSort]=useState('featured'),[search,setSearch]=useState(query),[maxPrice,setMaxPrice]=useState(10000),[available,setAvailable]=useState(false),[rating,setRating]=useState('all'),[attribute,setAttribute]=useState('all'),[comfort,setComfort]=useState('all'),[material,setMaterial]=useState('all'),[color,setColor]=useState('all'),[brand,setBrand]=useState('all'),[page,setPage]=useState(1),[mobileFilters,setMobileFilters]=useState(false);
 const attributes=useMemo(()=>[...new Set(products.flatMap(p=>p.specs.filter(s=>['Technology','Heating type','Capacity','Roof type','Width','Placement','Fuel'].includes(s.label)).map(s=>s.value)))],[products]);
 const comfortChoices=useMemo(()=>massageComfortOptions.filter(option=>products.some(product=>matchesMassageComfort(product,option.value))),[products]);
 const hasStockedProducts=products.some(product=>product.stockStatus==='In Stock');
 const ratingChoices=useMemo(()=>['1','2','3','4','4.5','4.8'].filter(value=>products.some(product=>product.reviewCount>0&&product.rating>=Number(value))),[products]);
 const filtered=useMemo(()=>{
  const terms=search.toLowerCase().replace(/[×x]/g,' ').split(/\s+/).filter(t=>t&&!['inch','inches'].includes(t));
  const list=products.filter(p=>p.price<=maxPrice&&(!available||p.stockStatus==='In Stock')&&(rating==='all'||p.rating>=Number(rating))&&(attribute==='all'||p.specs.some(s=>s.value===attribute))&&(comfort==='all'||matchesMassageComfort(p,comfort))&&(material==='all'||p.material===material)&&(color==='all'||p.variants.some(v=>v.color===color))&&(brand==='all'||p.brand===brand)&&terms.every(t=>[p.name,p.material,p.category,...p.features,...p.specs.map(s=>s.value)].join(' ').toLowerCase().replace(/[×x]/g,' ').includes(t)));
  return list.sort((a,b)=>sort==='price-low'?a.price-b.price:sort==='price-high'?b.price-a.price:sort==='rating'?Math.max(b.rating,b.demoRating)-Math.max(a.rating,a.demoRating):sort==='reviews'?Math.max(b.reviewCount,b.demoCount)-Math.max(a.reviewCount,a.demoCount):sort==='newest'?Number(b.newArrival)-Number(a.newArrival):sort==='best'?Number(b.bestSeller)-Number(a.bestSeller):Number(b.featured)-Number(a.featured));
 },[products,search,maxPrice,available,rating,attribute,comfort,material,color,brand,sort]);
 function reset(){setSearch('');setMaxPrice(10000);setAvailable(false);setRating('all');setAttribute('all');setComfort('all');setMaterial('all');setColor('all');setBrand('all');setPage(1)}
 function picker(label:string,value:string,onChange:(v:string)=>void,values:string[]){return <div className="filter-block"><h3>{label}</h3><Select value={value} onValueChange={v=>{onChange(v);setPage(1)}}><SelectTrigger aria-label={label}><SelectValue>{value==='all'?'All '+label.toLowerCase():value}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All {label.toLowerCase()}</SelectItem>{values.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>}
 return <div className="container page-body">
  <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>{title}</span></div>
  <div className="collection-heading"><p className="eyebrow">CURATED FOR THE WAY YOU LIVE</p><h1>{title}</h1><p>{intro??'Thoughtfully selected pieces. Space to make them your own.'}</p></div>
  {category==='massage-chairs'&&comfortChoices.length>0&&<div className="selector-banner"><div><h3>A quieter moment, designed around you.</h3><p>Explore chairs by the comfort features you value.</p></div><Select value={comfort} onValueChange={v=>{setComfort(v);setPage(1)}}><SelectTrigger aria-label="Massage comfort selector"><SelectValue>{comfortChoices.find(option=>option.value===comfort)?.label??'Full body relaxation'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">Full body relaxation</SelectItem>{comfortChoices.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>}
  <div className="listing-toolbar"><span>{filtered.length} pieces</span><button className="mobile-filter-button" onClick={()=>setMobileFilters(!mobileFilters)}><SlidersHorizontal size={16}/>Filters</button><Select value={sort} onValueChange={v=>{setSort(v);setPage(1)}}><SelectTrigger className="sort-select" aria-label="Sort products"><SelectValue>{({'featured':'Featured','best':'Our favorites','newest':'Newest','price-low':'Price: low to high','price-high':'Price: high to low','rating':'Highest rated','reviews':'Most reviewed'} as Record<string,string>)[sort]}</SelectValue></SelectTrigger><SelectContent>{[['featured','Featured'],['best','Our favorites'],['newest','Newest'],['price-low','Price: low to high'],['price-high','Price: high to low'],['rating','Highest rated'],['reviews','Most reviewed']].map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
  <div className="catalog-layout"><aside className={'filters '+(mobileFilters?'filters-open':'')}>
   <div className="filter-title"><h2>Refine your retreat</h2><button onClick={reset}>Reset</button></div>
   <div className="filter-block"><h3>Search collection</h3><div className="filter-search"><Search size={15}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Name, feature, or size" aria-label="Search collection"/></div></div>
   <div className="filter-block"><h3>Collections</h3>{categories.map(c=><Link className={category===c.slug?'active-filter':''} key={c.slug} href={'/collections/'+c.slug}>{c.name}</Link>)}</div>
   <div className="filter-block"><h3>Price range</h3><p className="small muted">{'$0 — $'+maxPrice.toLocaleString()}</p><Slider value={[maxPrice]} onValueChange={v=>{setMaxPrice(v[0]);setPage(1)}} min={0} max={10000} step={100} aria-label="Maximum price"/></div>
   {hasStockedProducts&&<div className="filter-block"><label className="compare-check"><Checkbox checked={available} onCheckedChange={v=>{setAvailable(!!v);setPage(1)}}/>In stock</label></div>}
   {attributes.length>0&&picker('Features & size',attribute,setAttribute,attributes)}
   {picker('Material',material,setMaterial,[...new Set(products.map(p=>p.material))])}
   {picker('Color',color,setColor,[...new Set(products.flatMap(p=>p.variants.map(v=>v.color)))])}
   {picker('Brand',brand,setBrand,[...new Set(products.map(p=>p.brand))])}
   {ratingChoices.length>0&&picker('Rating',rating,setRating,ratingChoices)}
  </aside><div>{filtered.length?<div className="listing-grid">{filtered.slice((page-1)*12,page*12).map(p=><ProductCard key={p.id} product={p}/>)}</div>:<div className="empty-state"><Search size={34}/><h2>A little more room to explore.</h2><p>No products match these filters. Try another feature or widen your price range.</p><button className="button outline" onClick={reset}>Clear filters</button></div>}{filtered.length>12&&<nav className="pagination" aria-label="Product pages"><button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button>{Array.from({length:Math.ceil(filtered.length/12)},(_,i)=><button aria-current={page===i+1?'page':undefined} key={i} onClick={()=>setPage(i+1)}>{i+1}</button>)}<button disabled={page>=Math.ceil(filtered.length/12)} onClick={()=>setPage(page+1)}>Next</button></nav>}</div></div><CompareTray/>
 </div>
}

