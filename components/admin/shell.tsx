'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {LayoutDashboard,ClipboardList,Armchair,Users,Star,FileText,Settings,Shield,History,ExternalLink,LogOut,CircleHelp} from 'lucide-react';
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarGroup,SidebarGroupLabel,SidebarInset,SidebarTrigger} from '@/components/ui/sidebar';
import {can,statusLabel} from '@/lib/workflow';
import type {StaffRole} from '@/generated/prisma/client';
import {api} from '@/components/store/provider';
const links=[
 {slug:'dashboard',label:'Home',icon:LayoutDashboard,permission:'orders:read',group:'daily'},
 {slug:'orders',label:'Orders',icon:ClipboardList,permission:'orders:read',group:'daily'},
 {slug:'products',label:'Products & photos',icon:Armchair,permission:'products',group:'daily'},
 {slug:'messages',label:'Customer messages',icon:Users,permission:'customers',group:'daily'},
 {slug:'reviews',label:'Customer reviews',icon:Star,permission:'reviews',group:'daily'},
 {slug:'business-contacts',label:'Contact details',icon:Settings,permission:'policies',group:'business'},
 {slug:'policies',label:'Shipping & store policies',icon:FileText,permission:'policies',group:'business'},
 {slug:'seasonal',label:'Christmas on / off',icon:Armchair,permission:'products',group:'business'},
 {slug:'taxonomy',label:'Categories & collections',icon:Armchair,permission:'products',group:'business'},
 {slug:'customers',label:'Customer accounts',icon:Users,permission:'customers',group:'advanced'},
 {slug:'settings',label:'Store settings & payments',icon:Settings,permission:'settings',group:'advanced'},
 {slug:'staff',label:'Staff access',icon:Shield,permission:'staff',group:'advanced'},
 {slug:'photo-sources',label:'Photo records',icon:FileText,permission:'products',group:'advanced'},
 {slug:'price-sources',label:'Price records',icon:FileText,permission:'products',group:'advanced'},
 {slug:'audit',label:'Activity history',icon:History,permission:'settings',group:'advanced'},
];
export function AdminShell({children,role,name,active}:{children:React.ReactNode;role:StaffRole;name:string;active:string}){
 const router=useRouter(),visible=links.filter(link=>can(role,link.permission));
 function menu(group:string){return <SidebarMenu>{visible.filter(link=>link.group===group).map(link=><SidebarMenuItem key={link.slug}><SidebarMenuButton asChild isActive={active===link.slug}><Link href={link.slug==='dashboard'?'/admin':`/admin/${link.slug}`}><link.icon/><span>{link.label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>}
 return <SidebarProvider className="admin-shell"><Sidebar className="admin-sidebar"><SidebarHeader><Link href="/admin" className="wordmark">HOME RETREAT<span>DIRECT · STORE ADMIN</span></Link></SidebarHeader><SidebarContent>
  <SidebarGroup><SidebarGroupLabel>EVERYDAY TASKS</SidebarGroupLabel>{menu('daily')}</SidebarGroup>
  {visible.some(link=>link.group==='business')&&<SidebarGroup><SidebarGroupLabel>YOUR BUSINESS</SidebarGroupLabel>{menu('business')}</SidebarGroup>}
  {visible.some(link=>link.group==='advanced')&&<SidebarGroup><details className="admin-nav-more" key={visible.find(link=>link.slug===active)?.group} open={visible.some(link=>link.group==='advanced'&&link.slug===active)||undefined}><summary>Settings & records</summary>{menu('advanced')}</details></SidebarGroup>}
  <SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={active==='help'}><Link href="/admin/help"><CircleHelp/><span>How to use your admin</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
 </SidebarContent><SidebarFooter><Link href="/" className="admin-store-link"><ExternalLink size={16}/>View website</Link><div className="staff-card"><span>{name.slice(0,1)}</span><div><strong>{name}</strong><p>{statusLabel(role)}</p></div><button aria-label="Sign out" className="icon-button" onClick={()=>api('/api/auth/logout','POST',{}).then(()=>{router.push('/admin');router.refresh()})}><LogOut size={16}/></button></div></SidebarFooter></Sidebar><SidebarInset><header className="admin-topbar"><SidebarTrigger/><span>{active==='help'?'How to use your admin':links.find(link=>link.slug===active)?.label??'Store admin'}</span><Link href="/admin/help" className="admin-protected"><CircleHelp size={16}/>Help</Link></header><main className="admin-content" id="main">{children}</main></SidebarInset></SidebarProvider>;
}
