import {redirect} from 'next/navigation';

export const metadata={title:'Terms',robots:{index:false,follow:false}};

export default function Page(){
 redirect('/terms#image-attribution');
}
