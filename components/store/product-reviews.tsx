'use client';

import {useState} from 'react';
import Image from 'next/image';
import {Check,Star} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';

export type PublicReview={id:string;rating:number;title:string;body:string;name:string;createdAt:string;verifiedPurchase:boolean;isDemo:boolean;reply:string|null;helpfulCount:number;images:{url:string;alt:string}[]};

const sorts=[['recent','Most recent'],['highest','Highest rating'],['lowest','Lowest rating'],['helpful','Most helpful'],['photos','With photos'],['verified','Verified purchases']];

export function ProductReviews({reviews,onWrite}:{reviews:PublicReview[];onWrite:()=>void}){
 const [sort,setSort]=useState('recent'),[stars,setStars]=useState<number|null>(null);
 const published=reviews.filter(r=>!r.isDemo),average=published.length?published.reduce((total,r)=>total+r.rating,0)/published.length:0;
 const shown=published.filter(r=>stars===null||r.rating===stars).filter(r=>sort!=='verified'||r.verifiedPurchase).filter(r=>sort!=='photos'||r.images.length>0).sort((a,b)=>sort==='highest'?b.rating-a.rating:sort==='lowest'?a.rating-b.rating:sort==='helpful'?b.helpfulCount-a.helpfulCount:Date.parse(b.createdAt)-Date.parse(a.createdAt));
 function reset(){setStars(null);setSort('recent')}
 return <section className="product-reviews" aria-label="Customer reviews">
  <div className="review-heading"><div><p className="eyebrow">CUSTOMER REVIEWS</p><h2>At home with this piece.</h2></div><button className="button outline" onClick={onWrite}>Write a review</button></div>
  <div className="review-summary">
   <div><strong>{published.length?average.toFixed(1):'—'}</strong><span> / 5</span><p>{published.length?`${published.length} customer ${published.length===1?'review':'reviews'}`:'Be the first to review this piece.'}</p>{published.length>0&&<span className="review-stars" aria-label={`${average.toFixed(1)} out of 5 stars`}>{[1,2,3,4,5].map(star=><Star key={star} size={18} fill={star<=Math.round(average)?'currentColor':'none'} aria-hidden="true"/>)}</span>}</div>
   <div className="rating-bars" aria-label="Filter reviews by star rating">{[5,4,3,2,1].map(rating=>{const count=published.filter(r=>r.rating===rating).length,pct=published.length?count/published.length*100:0;return <button type="button" key={rating} aria-label={`Show ${rating}-star reviews`} aria-pressed={stars===rating} onClick={()=>setStars(stars===rating?null:rating)}><span>{rating}<Star size={12} aria-hidden="true"/></span><span className="rating-bar-track"><i style={{width:pct+'%'}}/></span><span>{count}</span></button>})}</div>
  </div>
  <div className="review-sort"><div className="review-filter-status" role="status">{stars!==null&&<span>{stars}-star reviews</span>}{(stars!==null||sort!=='recent')&&<button className="text-link" onClick={reset}>Clear review filters</button>}</div><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort reviews"><SelectValue>{sorts.find(([value])=>value===sort)?.[1]}</SelectValue></SelectTrigger><SelectContent>{sorts.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
  {shown.length?shown.map(review=><article className="review-card" key={review.id}>
   <div><span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</span>{review.verifiedPurchase&&<span className="verified-badge"><Check size={13} aria-hidden="true"/>Verified Purchase</span>}</div>
   <h3>{review.title}</h3><p>{review.body}</p><span className="review-byline">{review.name} · <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('en-US')}</time></span>
   {review.images.length>0&&<div className="review-photos">{review.images.map(image=><div key={image.url}><Image src={image.url} alt={image.alt} fill sizes="150px"/></div>)}</div>}
   {review.reply&&<p className="review-reply"><strong>Home Retreat Direct</strong><br/>{review.reply}</p>}
  </article>):<div className="empty-state"><p>{published.length?'No reviews match these filters.':'How does this piece work in your home? Share what you like and what could be better.'}</p><button className="button outline" onClick={published.length?reset:onWrite}>{published.length?'Show all reviews':'Write a review'}</button></div>}
 </section>
}
