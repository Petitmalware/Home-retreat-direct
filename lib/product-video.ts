export function productVideoUrl(value:string|undefined|null):string|null{
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  if(url.hostname==='res.cloudinary.com'&&/\/(?:video|raw)\/upload\//.test(url.pathname))return url.href;
  if(url.hostname==='cdn1.costway.com'&&/^\/(?:media\/us\/Install_video\/|Display\+video\/)[^/]+\.mp4$/.test(decodeURI(url.pathname)))return url.href;
  if(url.hostname==='hooya.s3.us-west-1.amazonaws.com'&&/^\/(?:Display\+video\/CM[\w]+|media\/us\/Install_video\/\d+)\.mp4$/.test(decodeURI(url.pathname)))return url.href;
  return null;
 }catch{return null;}
}
