import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../.local/launcher.json',import.meta.url));
if(!fs.existsSync(file)){console.log('No local launcher is running.');process.exit(0);}
const launcher=JSON.parse(fs.readFileSync(file,'utf8'));
try{const response=await fetch(`http://127.0.0.1:${launcher.port}/stop`,{method:'POST',headers:{Authorization:'Bearer '+launcher.token},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Local launcher did not accept the shutdown request.');console.log('Stopping the local website and flushing its PostgreSQL data.');}catch(error){console.error(error.message);process.exitCode=1;}
