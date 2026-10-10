'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {api} from '@/components/store/provider';
import {toast} from 'sonner';

type Contacts={phone:string;address:string;businessHours:string};

export function BusinessContacts(){
 const router=useRouter(),[values,setValues]=useState<Contacts|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{api<Contacts>('/api/admin/business-contacts').then(setValues).catch(error=>setError(error.message));},[]);
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!values||busy)return;setBusy(true);setError('');
  try{await api('/api/admin/business-contacts','POST',values);toast.success('Business contact details updated.');router.refresh();}
  catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 if(!values)return error?<p className="form-error" role="alert">{error}</p>:<div className="admin-loading">Opening business contact details…</div>;
 return <><div className="admin-heading"><div><p className="eyebrow">HERE TO HELP</p><h1>Business contact details.</h1><p>Add or update the verified telephone, address and hours shown to customers.</p></div></div>
  <form className="panel editor-panel" onSubmit={save}><h2>Public contact information</h2><p className="small muted">Shown on the contact page when supplied. These fields are optional; leave any detail blank until it has been verified.</p>
   <div className="form-grid"><label className="field">Business phone (optional)<input type="tel" maxLength={25} value={values.phone} onChange={event=>setValues({...values,phone:event.target.value})} disabled={busy}/></label>
    <label className="field">Business hours (optional)<input maxLength={240} value={values.businessHours} onChange={event=>setValues({...values,businessHours:event.target.value})} disabled={busy}/></label>
    <label className="field full">Business address (optional)<textarea rows={3} maxLength={500} value={values.address} onChange={event=>setValues({...values,address:event.target.value})} disabled={busy}/></label></div>
   {error&&<p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy?'Saving…':'Save contact details'}</button>
  </form></>;
}
