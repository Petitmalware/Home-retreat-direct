import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {db} from '../lib/db';
import {businessProfile} from '../lib/business-profile';
import content from '../data/retail-content.json';

// Apply the supplied public business details once without opening checkout,
// enabling delivery or altering payment methods, owner credentials or products.
async function main(){
 const marker='businessProfileVersion',version='homeretreatdirect-2026-10-09';
 if((await db.siteSetting.findUnique({where:{key:marker}}))?.value===version){console.log('Business profile is already configured. Owner edits are preserved.');return;}
 const values={storeName:businessProfile.name,generalEmail:businessProfile.emails.info,ordersEmail:businessProfile.emails.orders,supportEmail:businessProfile.emails.support};
 const keys=Object.keys(values),existing=await db.siteSetting.findMany({where:{key:{in:keys}}}),contact=await db.policy.findUnique({where:{slug:'contact'}});
 const directory=path.resolve('.local/backups');await fs.mkdir(directory,{recursive:true});
 const backup=path.join(directory,'business-profile-'+Date.now()+'.json');
 await fs.writeFile(backup,JSON.stringify({settings:existing,contact},null,2),{flag:'wx',mode:0o600});
 await db.$transaction(async tx=>{
  for(const [key,value] of Object.entries(values))await tx.siteSetting.upsert({where:{key},update:{value},create:{key,value}});
  await tx.policy.upsert({where:{slug:'contact'},update:{body:content.contact,published:true,version},create:{slug:'contact',title:'Contact Us',body:content.contact,published:true,version}});
  await tx.siteSetting.upsert({where:{key:marker},update:{value:version},create:{key:marker,value:version}});
 });
 console.log('Configured three public business mailboxes and the contact page. A private backup was saved; delivery and checkout settings were preserved.');
}
main().catch(()=>{console.error('Business configuration failed. Check the private database configuration.');process.exitCode=1;}).finally(()=>db.$disconnect());
