import {readLocalImage} from '@/lib/local-media';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{file:string}>}){
 const {file}=await params,asset=await readLocalImage(file);
 if(!asset)return new Response(null,{status:404});
 return new Response(asset.bytes,{headers:{'Content-Type':asset.type,'Content-Length':String(asset.bytes.byteLength),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
