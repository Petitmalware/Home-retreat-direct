export type BrowserEvent='view_item'|'search'|'add_to_cart'|'begin_checkout'|'submit_order';
type AnalyticsWindow=Window&{gtag?:(...args:unknown[])=>void;fbq?:(...args:unknown[])=>void};
export function track(name:BrowserEvent,payload:Record<string,unknown>={}){
 if(typeof window==='undefined')return;window.dispatchEvent(new CustomEvent('retreat:analytics',{detail:{name,payload}}));if(!document.cookie.includes('hrd_analytics=1'))return;
 const w=window as AnalyticsWindow;w.gtag?.('event',name,payload);const meta:Partial<Record<BrowserEvent,string>>={view_item:'ViewContent',search:'Search',add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout'};if(meta[name])w.fbq?.('track',meta[name],payload);else w.fbq?.('trackCustom','OrderSubmitted',payload);
 // No client function accepts a Purchase event. Confirmed purchases come only from the server conversion ledger.
}
