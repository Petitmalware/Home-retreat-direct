'use client';
import type {StoreConfig} from '@/lib/store-config';
import {usePathname} from 'next/navigation';import {StoreProvider,useStore} from './provider';import {Header} from './header';import {Footer} from './footer';
function Frame({children,demo,config}:{children:React.ReactNode;demo:boolean;config:StoreConfig}){const path=usePathname(),{items}=useStore();if(path.startsWith('/admin'))return <>{children}</>;return <><Header config={config} cartCount={items.reduce((s,i)=>s+i.quantity,0)}/>{demo&&<div className="demo-notice">DEVELOPMENT CATALOG · Fictional products and representative photography. Products are not offered for sale.</div>}<main id="main">{children}</main><Footer config={config}/></>}
export function Chrome({children,demo,config}:{children:React.ReactNode;demo:boolean;config:StoreConfig}){return <StoreProvider><Frame demo={demo} config={config}>{children}</Frame></StoreProvider>}

