'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ClipboardCheck,Wallet,Package,Star,Armchair,Mail,CircleHelp} from 'lucide-react';
import {api} from '@/components/store/provider';
import {money} from '@/lib/catalog';
import {can,statusLabel} from '@/lib/workflow';
import {OrderTable} from './orders';
import type {OrderRow} from './types';
import type {StaffRole} from '@/generated/prisma/client';
type Metrics={ordersToday:number;ordersWeek:number;revenueCents:number|null;products:number;customers:number;pendingReviews:number;statuses:{status:string;_count:{_all:number}}[];recent:OrderRow[];lowStock:{variantId:string;quantity:number;variant:{name:string;product:{name:string}}}[]};
export function Dashboard({role}:{role:StaffRole}){
 const[d,setD]=useState<Metrics|null>(null),[error,setError]=useState('');
 useEffect(()=>{api<Metrics>('/api/admin/dashboard').then(setD).catch(error=>setError(error.message))},[]);
 if(error)return <p className="form-error">{error}</p>;
 if(!d)return <div className="admin-loading">Loading store activity…</div>;
 const count=(status:string)=>d.statuses.find(item=>item.status===status)?._count._all??0;
 return <><div className="admin-heading"><div><p className="eyebrow">YOUR STORE ADMIN</p><h1>What would you like to do?</h1><p>Start with a task. Open an order to see its next step.</p></div><Link className="button outline" href="/admin/help"><CircleHelp size={17}/>Show me how</Link></div>
 <div className="admin-task-grid">
  <Link className="panel admin-task-card" href="/admin/orders"><ClipboardCheck size={22}/><h2>Handle orders</h2><p>{count('AWAITING_REVIEW')+count('UNDER_REVIEW')} waiting for review. Check availability, send invoices and track delivery.</p><span className="text-link">Open orders →</span></Link>
  {can(role,'products')&&<Link className="panel admin-task-card" href="/admin/products"><Armchair size={22}/><h2>Edit products & photos</h2><p>Update prices, discounts, descriptions and product images.</p><span className="text-link">Open products →</span></Link>}
  {can(role,'customers')&&<Link className="panel admin-task-card" href="/admin/messages"><Mail size={22}/><h2>Answer customers</h2><p>Read enquiries submitted on your website and send a reply.</p><span className="text-link">Open messages →</span></Link>}
 </div>
 <section className="admin-section panel"><div className="admin-section-heading"><h2>Recent orders</h2><Link className="text-link" href="/admin/orders">View all orders</Link></div><OrderTable orders={d.recent}/></section>
 <details className="admin-section admin-extra panel"><summary>Store figures & inventory</summary><div className="metric-grid">{[['Orders today',d.ordersToday,ClipboardCheck],['Orders this week',d.ordersWeek,Package],['Confirmed revenue',d.revenueCents===null?'Restricted':money(d.revenueCents/100),Wallet],['Reviews to check',d.pendingReviews,Star]].map(([label,value,Icon])=>{const I=Icon as typeof Star;return <div className="metric-card" key={label as string}><div><span>{label as string}</span><I size={19}/></div><strong>{value as string|number}</strong></div>})}</div><div className="operations-grid">{['AWAITING_REVIEW','AWAITING_PAYMENT','PROCESSING','SHIPPED','DELIVERED'].map(status=><Link key={status} href={'/admin/orders?status='+status}><strong>{count(status)}</strong><span>{statusLabel(status)}</span></Link>)}</div><h2>Stock to check</h2>{d.lowStock.length?d.lowStock.map(item=><p key={item.variantId}>{item.variant.product.name} · {item.variant.name} · {item.quantity} units</p>):<p className="muted">No low stock alerts.</p>}</details>
 </>;
}
