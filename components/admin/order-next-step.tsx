import Link from 'next/link';
import {Mail,Check} from 'lucide-react';
import {actionLabels,adminOrderGuide,orderSteps} from '@/lib/admin-order-guide';
import {can} from '@/lib/workflow';
import type {StaffRole} from '@/generated/prisma/client';

export function OrderNextStep({status,role,hasPaymentMethod,onAction}:{status:string;role:StaffRole;hasPaymentMethod:boolean;onAction:(action:string)=>void}){
 const guide=adminOrderGuide(status,role),needsMethod=guide.action==='request-payment'&&!hasPaymentMethod;
 return <section className="panel order-next-step" aria-label="Order next step">
  {guide.step>=0&&<ol className="order-stepper" aria-label="Order progress">{orderSteps.map((step,index)=><li key={step} className={index<guide.step?'complete':index===guide.step?'current':''} aria-current={index===guide.step?'step':undefined}><span>{index<guide.step?<Check size={14}/>:index+1}</span>{step}</li>)}</ol>}
  <div className="order-next-step-body"><div><p className="eyebrow">{guide.action?'YOUR NEXT STEP':'ORDER UPDATE'}</p><h2>{guide.title}</h2><p>{guide.description}</p><p className="order-step-email"><Mail size={16}/><span>{guide.email}</span></p></div>{guide.action&&<button className="button dark" disabled={needsMethod} onClick={()=>onAction(guide.action!)}>{actionLabels[guide.action]}</button>}</div>
  {needsMethod&&<p className="notice">{can(role,'settings')?<Link className="text-link" href="/admin/settings?tab=payments">Add your business payment instructions first</Link>:'Ask the store owner to add a business payment method in Store settings before requesting payment.'}</p>}
  <Link className="text-link small" href="/admin/help">See the order and email guide</Link>
 </section>;
}
