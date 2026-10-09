export const contactTopics=[
 {value:'GENERAL',label:'General enquiry',channel:'info',setting:'generalEmail'},
 {value:'SUPPLIER_PARTNERSHIP',label:'Supplier & partnership',channel:'info',setting:'generalEmail'},
 {value:'ORDER',label:'Order enquiry',channel:'orders',setting:'ordersEmail'},
 {value:'SUPPORT',label:'Customer support',channel:'support',setting:'supportEmail'},
] as const;
export type ContactTopic=typeof contactTopics[number]['value'];
export const contactTopic=(value:ContactTopic)=>contactTopics.find(topic=>topic.value===value)!;
export const storedContactSubject=(topic:ContactTopic,subject:string)=>`[${contactTopic(topic).label}] ${subject}`;
export function readContactSubject(subject:string){
 const topic=contactTopics.find(item=>subject.startsWith(`[${item.label}] `))??contactTopics[0];
 return {topic:topic.value,label:topic.label,channel:topic.channel,subject:subject.startsWith(`[${topic.label}] `)?subject.slice(topic.label.length+3):subject};
}
export function contactNotificationSubject(message:{id:string;subject:string}){
 const prefix=`Enquiry ${message.id}: `;
 return prefix+message.subject.slice(0,200-prefix.length);
}
