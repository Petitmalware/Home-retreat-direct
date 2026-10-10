import type {NextConfig} from 'next';
const hosted=process.env.SITES_BUILD==='true';
const config:NextConfig={
 output:'standalone',
 htmlLimitedBots:/.*/,
 // These dynamically required production files are omitted by automatic tracing.
 outputFileTracingIncludes:{'/*':[
  './node_modules/next/dist/compiled/next-server/*.runtime.prod.js',
  './node_modules/pg-protocol/dist/**/*.js',
  './node_modules/pg-protocol/esm/**/*.js',
  './node_modules/@prisma/client-runtime-utils/dist/**/*.{js,mjs}',
 ]},
 outputFileTracingExcludes:{'/*':['./.sites-runtime/**/*','./.open-next/**/*','./.env*','./.local/**/*','./.git/**/*','./tests/**/*','./test-results/**/*','./dist/**/*','./.next/dev/**/*',...(hosted?['./node_modules/**/*.wasm']:[])]},
 turbopack:hosted?{resolveAlias:{'@/generated/prisma/client':'./generated/prisma-worker/client.ts'}}:undefined,
 images:{remotePatterns:[{protocol:'https',hostname:'res.cloudinary.com'}],unoptimized:process.env.SITES_RUNTIME==='true'},
 poweredByHeader:false,
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]}]},
};
export default config;
