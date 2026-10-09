'use client';
import {useEffect,useState,useCallback} from 'react';
import {api} from '@/components/store/provider';
import {contactTopics,type ContactTopic} from '@/lib/contact-topics';
import {toast} from 'sonner';
type Message={id:string;name:string;email:string;subject:string;message:string;reviewed:boolean;createdAt:string;topic:ContactTopic;label:string;notification:{to:string;status:string;sentAt:string|null}|null};
export function Messages(){
 const[messages,setMessages]=useState<Message[]>([]),[topic,setTopic]=useState('ALL'),[error,setError]=useState('');
 const load=useCallback(()=>api<{messages:Message[]}>('/api/admin/messages').then(data=>{setMessages(data.messages);setError('');}).catch(error=>setError(error.message)),[]);
 useEffect(()=>{void load()},[load]);
 async function mark(message:Message){try{await api('/api/admin/messages','PATCH',{id:message.id,reviewed:!message.reviewed});await load();}catch(error){toast.error((error as Error).message);}}
 const visible=messages.filter(message=>topic==='ALL'||message.topic===topic);
 return <><div className="admin-heading"><div><p className="eyebrow">HERE TO HELP</p><h1>Customer messages.</h1><p>Business enquiries, supplier conversations, orders and customer support.</p></div></div>
  <section className="panel editor-panel"><label className="field">Filter enquiries<select value={topic} onChange={event=>setTopic(event.target.value)}><option value="ALL">All enquiries</option>{contactTopics.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="small muted">Messages stay in this private inbox. Each new enquiry also queues a notification to its business mailbox; reply using that mailbox so your customer hears from the right team.</p></section>
  {error&&<p className="form-error">{error}</p>}{visible.length?visible.map(message=><article key={message.id} className="panel editor-panel">
   <span className="status-badge">{message.reviewed?'Reviewed':'New'} · {message.label}</span><h2>{message.subject}</h2>
   <p>{message.name} · <a href={'mailto:'+encodeURIComponent(message.email)+'?subject='+encodeURIComponent('Re: '+message.subject)}>{message.email}</a> · {new Date(message.createdAt).toLocaleString('en-US')}</p>
   {message.notification&&<p className="small muted">Business mailbox: {message.notification.to} · Notification {message.notification.status.toLowerCase().replaceAll('_',' ')}{message.notification.sentAt?' · '+new Date(message.notification.sentAt).toLocaleString('en-US'):''}</p>}
   <p style={{whiteSpace:'pre-wrap'}}>{message.message}</p><button className="button outline" onClick={()=>mark(message)}>{message.reviewed?'Mark unread':'Mark reviewed'}</button>
  </article>):<section className="panel editor-panel"><p>{topic==='ALL'?'No customer messages yet.':'No enquiries in this category.'}</p></section>}</>;
}
