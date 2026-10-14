'use client';
import {useState} from 'react';
import {productVideoUrl} from '@/lib/product-video';
export function ProductVideo({url,poster,title}:{url:string;poster:string;title?:string}){
 const [failed,setFailed]=useState(false),source=productVideoUrl(url);
 if(!source)return null;
 return <section className="product-video-panel" aria-label={title||'Product video'}><h2>{title||'See the product in motion'}</h2>{failed?<p className="small">The video could not load. <a href={source} target="_blank" rel="noopener noreferrer" className="text-link">Open the video</a></p>:<video controls playsInline preload="none" poster={poster} className="product-video" onError={()=>setFailed(true)}><source src={source}/>Your browser does not support video playback.</video>}</section>;
}
