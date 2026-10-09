type GalleryImage={url:string;kind?:string};
export function galleryReady(images:GalleryImage[]){
 const photographs=images.filter(image=>image.kind!=='DIMENSIONS'&&!/\.svg(?:[?#]|$)/i.test(image.url));
 return photographs.length>=4&&new Set(photographs.map(image=>image.url)).size===photographs.length;
}
