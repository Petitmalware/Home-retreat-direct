import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {parse} from 'dotenv';
const root=process.cwd(),local=fs.existsSync('.env.hosted')?parse(fs.readFileSync('.env.hosted')):fs.existsSync('.env')?parse(fs.readFileSync('.env')):{};
const env={...process.env,...local,APP_ORIGIN:process.env.HOSTED_APP_ORIGIN??'https://home-retreat-direct.nearbykidd.chatgpt.site',SITES_BUILD:'true',SITES_RUNTIME:'true',NEXT_TELEMETRY_DISABLED:'1'};
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',env});if(r.status!==0)throw new Error('Hosted build step failed.');}
fs.mkdirSync('.sites-runtime',{recursive:true});
const schema=fs.readFileSync('prisma/schema.prisma','utf8').replace('output = "../generated/prisma"','output = "../generated/prisma-worker"\n runtime = "cloudflare"');fs.writeFileSync('.sites-runtime/schema.worker.prisma',schema);
run(['node_modules/prisma/build/index.js','generate','--schema','.sites-runtime/schema.worker.prisma']);
run(['node_modules/next/dist/bin/next','build']);
run([...(process.platform==='win32'?['--import','./scripts/windows-symlinks.mjs']:[]),'node_modules/@opennextjs/cloudflare/dist/cli/index.js','build','--skipNextBuild']);
fs.writeFileSync('.open-next/cloudflare/next-env.mjs','export const production = {};\nexport const development = {};\nexport const test = {};\n');
const output=path.resolve(root,'dist');if(!output.startsWith(root+path.sep)||path.basename(output)!=='dist')throw new Error('Unexpected build output path.');fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync('dist/server',{recursive:true});fs.cpSync('.open-next/assets','dist/client',{recursive:true});
run(['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir','dist/server']);
const worker=fs.readdirSync('dist/server').find(f=>f.endsWith('.js')&&!f.endsWith('.map'));if(!worker)throw new Error('No Worker generated.');if(worker!=='index.js')fs.renameSync('dist/server/'+worker,'dist/server/index.js');
for(const f of fs.readdirSync('dist/server'))if(f.endsWith('.map'))fs.unlinkSync('dist/server/'+f);
const scan=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())scan(file);else{const bytes=fs.readFileSync(file);for(const k of ['DATABASE_URL','DIRECT_DATABASE_URL','ENCRYPTION_KEY','SEED_OWNER_PASSWORD','RESEND_API_KEY','CLOUDINARY_API_SECRET'])if(local[k]&&bytes.includes(Buffer.from(local[k])))throw new Error('Secret detected in build artifact: '+k);}}};scan(output);
fs.writeFileSync('dist/server/wrangler.json',JSON.stringify({name:'home-retreat-direct',main:'index.js',compatibility_date:'2026-10-01',compatibility_flags:['nodejs_compat'],assets:{directory:'../client',binding:'ASSETS'}},null,2));fs.mkdirSync('dist/.openai',{recursive:true});fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');console.log('Hosted Next.js artifact packaged. Secret scan passed.');
