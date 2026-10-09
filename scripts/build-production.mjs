import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {stripStandaloneEnvironment} from './build-artifact-safety.mjs';

const args=process.platform==='win32'?['--import','./scripts/windows-symlinks.mjs']:[];
const result=spawnSync(process.execPath,[...args,'node_modules/next/dist/bin/next','build'],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
const removed=stripStandaloneEnvironment(path.resolve('.next/standalone'));
console.log(`Standalone runtime environment files excluded: ${removed}.`);
process.exitCode=result.status??1;
