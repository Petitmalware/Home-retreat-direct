import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localMediaEnabled,saveLocalImage,readLocalImage} from '../lib/local-media';

test('persistent uploads survive a new read and reject traversal and unconfigured hosting',async()=>{
 const keys=['APP_ORIGIN','LOCAL_MEDIA_ENABLED','LOCAL_MEDIA_DIRECTORY','SITES_RUNTIME'] as const,original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const directory=await mkdtemp(path.join(tmpdir(),'hrd-media-test-'));
 try{
  process.env.APP_ORIGIN='https://homeretreatdirect.com';process.env.SITES_RUNTIME='false';delete process.env.LOCAL_MEDIA_ENABLED;
  assert.equal(localMediaEnabled(),false);await assert.rejects(saveLocalImage(new Uint8Array([1]),'jpg'));
  process.env.LOCAL_MEDIA_ENABLED='true';process.env.LOCAL_MEDIA_DIRECTORY=directory;
  const bytes=new Uint8Array([255,216,255,224,0,0]),saved=await saveLocalImage(bytes,'jpg');
  assert.match(saved.url,/^\/api\/media\/[a-f0-9-]+\.jpg$/);
  const filename=saved.url.split('/').at(-1)!;
  assert.deepEqual((await readLocalImage(filename))?.bytes,bytes);assert.equal((await readLocalImage(filename))?.type,'image/jpeg');
  assert.equal(await readLocalImage('../'+filename),null);assert.equal(await readLocalImage('not-an-upload.jpg'),null);
  process.env.SITES_RUNTIME='true';assert.equal(localMediaEnabled(),false);assert.equal(await readLocalImage(filename),null);
 }finally{
  for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
  assert(directory.startsWith(path.join(tmpdir(),'hrd-media-test-')));await rm(directory,{recursive:true,force:true});
 }
});
