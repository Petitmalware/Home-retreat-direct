'use client';
import {useState} from 'react';
import {api} from './provider';
import {contactTopics} from '@/lib/contact-topics';
export function ContactForm(){
 const[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await api('/api/contact','POST',Object.fromEntries(new FormData(event.currentTarget)));setDone(true);}
  catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel editor-panel"><h2>How can we help?</h2>{done?<p className="success-note" role="status">Your message has been received. Our team will reply to your email address. Thank you for getting in touch.</p>:<form onSubmit={submit} className="form-grid">
  <label className="field">Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label>
  <label className="field">Email address<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
  <label className="field full">Enquiry type<select name="topic" defaultValue="GENERAL" aria-describedby="contact-topic-help">{contactTopics.map(topic=><option key={topic.value} value={topic.value}>{topic.label}</option>)}</select><span id="contact-topic-help" className="small muted">Choose the team that can best help with your enquiry.</span></label>
  <label className="field full">Subject<input name="subject" required minLength={3} maxLength={160}/></label>
  <label className="field full">Message<textarea name="message" rows={6} required minLength={20} maxLength={5000}/><span className="small muted">Include your order number when relevant. Do not send passwords or payment details.</span></label>
  {error&&<p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy?'Sending…':'Send message'}</button>
 </form>}</section>;
}
