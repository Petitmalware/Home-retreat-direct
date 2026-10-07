import {storeConfig} from '@/lib/store-config';
import type {Metadata} from 'next';import {Chrome} from '@/components/store/chrome';import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const config=await storeConfig();return {metadataBase:new URL(process.env.APP_ORIGIN??'http://127.0.0.1:3000'),title:{default:'Home Retreat Direct | A better kind of home',template:'%s | Home Retreat Direct'},description:'Considered outdoor living, home comfort and wellness. Explore premium pieces, compare specifications and submit an order for review before payment.',robots:process.env.DEVELOPMENT_CATALOG==='true'?{index:false,follow:false}:undefined,icons:{icon:config.faviconUrl}};}
export default async function Layout({children}:{children:React.ReactNode}){const config=await storeConfig();return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><Chrome config={config} demo={process.env.DEVELOPMENT_CATALOG==='true'}>{children}</Chrome></body></html>}

