'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Switch} from '@/components/ui/switch';
import {api} from '@/components/store/provider';
import {money} from '@/lib/catalog';
import type {SeasonSettings} from '@/lib/seasonal';
import {toast} from 'sonner';
type Data={settings:SeasonSettings&{active:boolean};products:{id:string;name:string;slug:string;priceCents:number;discountPercent:number;videoUrl:string|null;_count:{images:number}}[]};
export function Seasonal(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[startsOn,setStart]=useState(''),[endsOn,setEnd]=useState('');
 const router=useRouter();
 useEffect(()=>{api<Data>('/api/admin/seasonal').then(value=>{setData(value);setStart(value.settings.startsOn);setEnd(value.settings.endsOn);}).catch(error=>setError(error.message));},[]);
 async function save(settings:SeasonSettings){setBusy(true);try{const result=await api<Data>('/api/admin/seasonal','POST',settings);setData(result);router.refresh();toast.success(result.settings.mode==='scheduled'?'Christmas dates saved.':result.settings.active?'Christmas collection is visible.':'Christmas collection is hidden.');}catch(error){toast.error((error as Error).message);}finally{setBusy(false);}}
 if(error)return <p className="form-error">{error}</p>;
 if(!data)return <p>Opening seasonal collections…</p>;
 return <><div className="admin-heading"><div><p className="eyebrow">SEASONAL COLLECTIONS</p><h1>Christmas, when you want it.</h1><p>One switch controls the collection, its products and the Christmas promotion.</p></div>{data.settings.active&&<Link href="/collections/christmas" className="button outline">View Christmas collection</Link>}</div>
 <section className="panel editor-panel seasonal-controls"><h2>Show or hide Christmas</h2><label className="switch-label"><Switch checked={data.settings.active} disabled={busy} onCheckedChange={visible=>save({mode:visible?'on':'off',startsOn,endsOn})}/><strong>Show Christmas on the website</strong></label><p className="notice" role="status">{busy?'Saving…':data.settings.mode==='scheduled'?`Scheduled: ${data.settings.startsOn} through ${data.settings.endsOn}. Currently ${data.settings.active?'visible':'hidden'}.`:data.settings.active?'Visible now. Customers can browse the collection and request orders.':'Hidden now. Seasonal product links, search results and new orders are disabled.'}</p><p className="small muted">The switch saves immediately. Products, photos, prices and existing orders remain saved when the collection is hidden.</p></section>
 <details className="panel editor-panel"><summary><strong>Optional: show Christmas automatically on chosen dates</strong></summary><form onSubmit={event=>{event.preventDefault();void save({mode:'scheduled',startsOn,endsOn});}}><p>Dates use Eastern Time (America/New_York). The collection appears at the start of the first date and stays visible through the last date. The manual switch replaces the schedule.</p><div className="form-grid"><label className="field">First visible day<input type="date" required value={startsOn} onChange={event=>setStart(event.target.value)}/></label><label className="field">Last visible day<input type="date" required min={startsOn||undefined} value={endsOn} onChange={event=>setEnd(event.target.value)}/></label></div><button className="button dark" disabled={busy}>Use these dates</button></form></details>
 <section className="panel editor-panel"><h2>Your Christmas products</h2><p>{data.products.length} products · {data.products.reduce((total,p)=>total+p._count.images,0)} images · {data.products.filter(p=>p.videoUrl).length} videos</p><p className="small muted">Open a product to update its photos, video, details, price or discount. To add a new seasonal product, select the Christmas at Home collection in the product editor.</p><div className="seasonal-product-list">{data.products.map(p=><article key={p.id}><div><Link href={'/admin/products/'+p.id}>{p.name}</Link><p className="small muted">{p._count.images} images{p.videoUrl?' · Video included':''} · {p.discountPercent}% discount</p></div><strong>{money(Math.round(p.priceCents*(100-p.discountPercent)/100)/100)}</strong><Link href={'/admin/products/'+p.id} className="text-link">Edit</Link></article>)}</div></section></>;
}
