import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {stripStandaloneEnvironment} from '../scripts/build-artifact-safety.mjs';

test('standalone packaging excludes copied dotenv files without touching source configuration',()=>{
 const directory=fs.mkdtempSync(path.join(tmpdir(),'hrd-build-safety-test-')),output=path.join(directory,'standalone');
 try{
  fs.mkdirSync(output);fs.writeFileSync(path.join(directory,'.env'),'source fixture');fs.writeFileSync(path.join(output,'.env'),'copied fixture');fs.writeFileSync(path.join(output,'.env.production'),'copied fixture');fs.writeFileSync(path.join(output,'server.js'),'server fixture');
  assert.equal(stripStandaloneEnvironment(output),2);assert(fs.existsSync(path.join(directory,'.env')));assert(fs.existsSync(path.join(output,'server.js')));assert.equal(stripStandaloneEnvironment(output),0);
 }finally{assert(directory.startsWith(path.join(tmpdir(),'hrd-build-safety-test-')));fs.rmSync(directory,{recursive:true,force:true});}
});
