import {storeConfig} from '@/lib/store-config';
import {organizationSchema,publicOrigin,serializeJsonLd} from '@/lib/seo';
import type {Metadata} from 'next';import {Chrome} from '@/components/store/chrome';import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const config=await storeConfig();return {metadataBase:new URL(publicOrigin()),title:{default:config.storeName+' | A better kind of home',template:'%s | '+config.storeName},description:'Considered outdoor living, home comfort and wellness. Explore premium pieces, compare specifications and submit an order for review before payment.',robots:{index:true,follow:true},icons:{icon:config.faviconUrl}};}
export default async function Layout({children}:{children:React.ReactNode}){const config=await storeConfig();return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(organizationSchema(config))}}/><Chrome config={config}>{children}</Chrome></body></html>}

