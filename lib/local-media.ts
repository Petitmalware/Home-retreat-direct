import {randomUUID} from 'node:crypto';
import {localMediaFilename} from './media-paths';
import path from 'node:path';

export function localMediaEnabled(){
 if(process.env.SITES_RUNTIME==='true')return false;
 if(process.env.LOCAL_MEDIA_ENABLED==='true')return true;
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.APP_ORIGIN??'').hostname);}catch{return false;}
}
export function localMediaDirectory(){return path.resolve(/*turbopackIgnore: true*/process.env.LOCAL_MEDIA_DIRECTORY||path.join(process.cwd(),'.local','media'));}
export async function saveLocalImage(bytes:Uint8Array,extension:'jpg'|'png'|'webp'){
 if(!localMediaEnabled())throw new Error('Persistent image storage is not configured.');
 const fs=await import('node:fs/promises');
 const directory=localMediaDirectory();await fs.mkdir(directory,{recursive:true});
 const filename=randomUUID()+'.'+extension;await fs.writeFile(path.join(/*turbopackIgnore: true*/directory,filename),bytes,{flag:'wx'});
 return {url:'/api/media/'+filename,publicId:'local/'+filename};
}
export async function readLocalImage(filename:string){
 if(!localMediaEnabled()||!localMediaFilename.test(filename))return null;
 const fs=await import('node:fs/promises');
 try{const bytes=await fs.readFile(path.join(/*turbopackIgnore: true*/localMediaDirectory(),filename));return {bytes:new Uint8Array(bytes),type:filename.endsWith('.jpg')?'image/jpeg':filename.endsWith('.png')?'image/png':'image/webp'};}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
