'use client';

import {useEffect,useState} from 'react';
import {Download,Mail,RefreshCw} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {api} from '@/components/store/provider';
import {can,statusLabel} from '@/lib/workflow';
import type {StaffRole} from '@/generated/prisma/client';
import type {AdminEmailRecord,AdminOrder} from './types';
import {toast} from 'sonner';

type Template='ORDER_CONFIRMATION'|'INVOICE'|'PAYMENT_RECEIPT';
type Preview={to:string;subject:string;text:string;html:string;attachments:{filename:string;contentType:string;downloadUrl:string}[];canQueue:boolean;reason?:string;emailConfigured:boolean};
const titles:Record<Template,string>={ORDER_CONFIRMATION:'Order confirmation',INVOICE:'Invoice',PAYMENT_RECEIPT:'Payment receipt'};
const deliveryLabels:Record<string,string>={QUEUED:'Waiting to send',SENDING:'Sending',SENT:'Sent to email provider',FAILED:'Could not send',REVIEW_REQUIRED:'Check delivery before retrying'};
const financialTemplates=new Set(['INVOICE','APPROVED','COST_UPDATED','PAYMENT_RECEIPT','PAYMENT_RECEIVED','PAYMENT_INSTRUCTIONS']);

export function OrderEmailPanel({order,role,emailConfigured,onUpdated,onCompose}:{order:AdminOrder;role:StaffRole;emailConfigured:boolean;onUpdated:()=>Promise<void>;onCompose:()=>void}){
 const[template,setTemplate]=useState<Template|null>(null),[retry,setRetry]=useState<AdminEmailRecord|null>(null),[busy,setBusy]=useState(false);
 const customers=can(role,'customers'),payments=can(role,'payments');
 const customerEmails=order.emails.filter(email=>!email.template.startsWith('ORDER_STAFF_ALERT')).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const staffEmails=order.emails.filter(email=>email.template.startsWith('ORDER_STAFF_ALERT'));
 const waiting=customerEmails.some(email=>['QUEUED','SENDING'].includes(email.status));
 useEffect(()=>{if(!waiting)return;const timer=setInterval(()=>void onUpdated(),15000);return()=>clearInterval(timer)},[waiting,onUpdated]);
 const confirmed=(order.payments??[]).filter(payment=>['CONFIRMED','REFUNDED'].includes(payment.status)).reduce((sum,payment)=>sum+payment.amountReceivedCents,0);
 const chargesConfirmed=order.shippingConfirmed&&order.taxConfirmed&&order.shippingCents!==null&&order.taxCents!==null;
 const approved=['APPROVED','PAYMENT_INSTRUCTIONS_SENT','AWAITING_PAYMENT','PAYMENT_VERIFICATION','PAYMENT_RECEIVED','PROCESSING','PREPARING_SHIPMENT','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','REFUND_PENDING','REFUNDED'].includes(order.status)&&chargesConfirmed;
 const paid=chargesConfirmed&&confirmed>=order.totalCents&&order.totalCents>0;

 async function retryEmail(){if(!retry)return;setBusy(true);try{await api('/api/admin/orders/'+order.id+'/emails/'+retry.id,'POST',{version:order.version});await onUpdated();setRetry(null);toast.success('A new copy is queued. The email log records delivery status.');}catch(error){toast.error((error as Error).message);}finally{setBusy(false);}}

 return <section className="panel order-email-panel">
  <div className="admin-section-heading"><h2>Emails & documents</h2>{customers&&<button className="icon-button" aria-label="Compose customer email" onClick={onCompose}><Mail size={18}/></button>}</div>
  <p className="small muted">For {order.email}. Order buttons send the right emails automatically. Use these previews or send another copy if the customer asks.</p>
  <p className="small"><strong>Preview a document</strong> (opening a preview does not send it)</p><div className="order-email-buttons">
   {customers&&<button className="button outline" disabled={order.status==='DRAFT'} onClick={()=>setTemplate('ORDER_CONFIRMATION')}>Order confirmation</button>}
   {payments&&<button className="button outline" disabled={!approved} onClick={()=>setTemplate('INVOICE')}>Invoice</button>}
   {payments&&<button className="button outline" disabled={!paid} onClick={()=>setTemplate('PAYMENT_RECEIPT')}>Payment receipt</button>}
  </div>
  {payments&&!approved&&<p className="small muted">Approve the order and its delivery charges before preparing an invoice.</p>}
  {payments&&!paid&&<p className="small muted">A payment receipt becomes available after the full payment is confirmed.</p>}
  <p className="email-configuration-note"><span className="status-badge">{emailConfigured?'Email sending enabled':'Email sending needs setup'}</span>{!emailConfigured&&<span> Messages are saved but will not send until the business email service is connected. Ask the owner to check Store settings → Services & launch.</span>}</p>
  <details className="admin-email-history" open><summary>Email history ({customerEmails.length})</summary><p className="small muted">Waiting messages are usually picked up within a minute. Refresh to check their progress.</p><button className="text-link" onClick={()=>void onUpdated()}>Refresh email status</button>
  {customerEmails.length?customerEmails.map(email=><article className="email-record" key={email.id}>
   <strong>{email.subject}</strong><span className="status-badge">{deliveryLabels[email.status]??statusLabel(email.status)}</span>
   <p>To: {email.to??order.email}<br/>{new Date(email.createdAt).toLocaleString('en-US')}{email.sentAt&&<><br/>Provider accepted: {new Date(email.sentAt).toLocaleString('en-US')}</>}</p>
   {!!email.attachments?.length&&<p>{email.attachments.map(attachment=>attachment.filename).join(' · ')}</p>}
   {email.error&&<p className="form-error">{email.error}</p>}
   {['SENT','FAILED'].includes(email.status)&&(financialTemplates.has(email.template)?payments:customers)&&<button className="text-link" onClick={()=>setRetry(email)}><RefreshCw size={13}/> {email.status==='SENT'?'Send another copy':'Retry sending'}</button>}
  </article>):<p className="small muted">No customer emails have been queued for this order.</p>}</details>
  {!!staffEmails.length&&<details className="admin-email-history"><summary>Staff notifications ({staffEmails.length})</summary>{staffEmails.map(email=><article className="email-record" key={email.id}><strong>{email.subject}</strong><span className="status-badge">{deliveryLabels[email.status]??statusLabel(email.status)}</span><p>To: {email.to??'Orders mailbox'}<br/>{new Date(email.createdAt).toLocaleString('en-US')}</p>{email.error&&<p className="form-error">{email.error}</p>}</article>)}</details>}
  {template&&<EmailPreview key={template+':'+order.version} order={order} template={template} onClose={()=>setTemplate(null)} onUpdated={onUpdated}/>}
  <Dialog open={!!retry} onOpenChange={open=>{if(!open&&!busy)setRetry(null);}}><DialogContent className="action-dialog"><DialogTitle>{retry?.status==='SENT'?'Send another copy':'Retry customer email'}</DialogTitle><DialogDescription>A new copy of the saved message and its original attachments will be queued to {retry?.to??order.email}. The existing delivery record remains in the email log.</DialogDescription><p>{retry?.subject}</p><button className="button dark" disabled={busy} onClick={retryEmail}>{busy?'Saving for sending…':'Send copy'}</button></DialogContent></Dialog>
 </section>;
}

function EmailPreview({order,template,onClose,onUpdated}:{order:AdminOrder;template:Template;onClose:()=>void;onUpdated:()=>Promise<void>}){
 const[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState<'html'|'text'>('html');
 useEffect(()=>{let active=true;void api<Preview>('/api/admin/orders/'+order.id+'/emails/preview?template='+template).then(data=>{if(active)setPreview(data);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[order.id,order.version,template]);
 async function queue(){if(!template||!preview?.canQueue)return;setBusy(true);try{await api('/api/admin/orders/'+order.id+'/emails','POST',{template,version:order.version});await onUpdated();onClose();toast.success(titles[template]+' queued. Check the email log for delivery status.');}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <Dialog open={!!template} onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="email-preview-dialog">
  <DialogTitle>{template?titles[template]:''}</DialogTitle><DialogDescription>Preview the email and download its PDF. Use “Send another copy” only if the customer needs it again.</DialogDescription>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {!preview&&!error&&<p className="small muted">Preparing email preview…</p>}
  {preview&&<>
   <div className="email-preview-envelope"><p><strong>To</strong> {preview.to}</p><p><strong>Subject</strong> {preview.subject}</p></div>
   <div className="email-preview-view" role="group" aria-label="Email preview format"><button className={view==='html'?'button dark':'button outline'} aria-pressed={view==='html'} onClick={()=>setView('html')}>Email design</button><button className={view==='text'?'button dark':'button outline'} aria-pressed={view==='text'} onClick={()=>setView('text')}>Plain text</button></div>
   {view==='html'?<iframe className="email-preview-frame" sandbox="" title={template?titles[template]+' email preview':'Email preview'} srcDoc={preview.html}/>:<pre className="email-preview-text">{preview.text}</pre>}
   {!!preview.attachments.length&&<div className="email-preview-attachments"><strong>Attachments</strong>{preview.attachments.map(attachment=><a className="text-link" key={attachment.filename} href={attachment.downloadUrl} target="_blank" rel="noopener noreferrer"><Download size={15}/> {attachment.filename}</a>)}</div>}
   {preview.reason&&<p className="notice">{preview.reason}</p>}
   {!preview.emailConfigured&&<p className="small muted">This email will remain in the outbox until your business email service is configured.</p>}
   <button className="button dark full-width" disabled={busy||!preview.canQueue} onClick={queue}>{busy?'Saving for sending…':'Send another copy'}</button>
  </>}
 </DialogContent></Dialog>;
}
