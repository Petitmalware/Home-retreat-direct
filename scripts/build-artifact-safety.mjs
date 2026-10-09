import fs from 'node:fs';
import path from 'node:path';

// Next may explicitly copy build-time dotenv files even when tracing excludes
// them. The standalone server receives secrets from its runtime environment.
export function stripStandaloneEnvironment(directory){
 const root=path.resolve(directory);if(!fs.existsSync(root))return 0;
 if(fs.lstatSync(root).isSymbolicLink())throw new Error('Standalone output must not be a symlink.');
 let removed=0;
 function walk(current){
  for(const entry of fs.readdirSync(current,{withFileTypes:true})){
   if(entry.isSymbolicLink())continue;
   const filename=path.resolve(current,entry.name);
   if(!filename.startsWith(root+path.sep))throw new Error('Invalid standalone output path.');
   if(entry.isDirectory())walk(filename);
   else if(entry.isFile()&&/^\.env(?:\.|$)/.test(entry.name)){fs.unlinkSync(filename);removed++;}
  }
 }
 walk(root);return removed;
}
