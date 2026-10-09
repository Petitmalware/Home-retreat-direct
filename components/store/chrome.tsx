'use client';
import type {StoreConfig} from '@/lib/store-config';
import {usePathname} from 'next/navigation';import {StoreProvider,useStore} from './provider';import {Header} from './header';import {Footer} from './footer';
function Frame({children,config}:{children:React.ReactNode;config:StoreConfig}){const path=usePathname(),{items}=useStore();if(path.startsWith('/admin'))return <>{children}</>;return <><Header config={config} cartCount={items.reduce((s,i)=>s+i.quantity,0)}/><main id="main">{children}</main><Footer config={config}/></>}
export function Chrome({children,config}:{children:React.ReactNode;config:StoreConfig}){return <StoreProvider><Frame config={config}>{children}</Frame></StoreProvider>}

