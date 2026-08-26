import {mkdir,rm,copyFile,readFile,writeFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
const out='dist';await rm(out,{recursive:true,force:true});await mkdir(`${out}/icons`,{recursive:true});
const files=['index.html','phase3.html','auth.css','auth-recovery.css','auth-state.mjs','manifest.webmanifest','sw.js','pwa-register.js','property-context.js','property-catalog.js','bottle-intelligence.js','smart-count-launcher.js','pourgrid-vision.js','product-persistence.js','history-analytics.js','seasonal-profiles.js','predictive-ordering.js','order-pipeline.js','shared-drafts.js','drink-price-estimator.js','phase3-domain.js','sapphire-logo-original.png'];
for(const file of files){try{await copyFile(file,`${out}/${file}`)}catch(error){if(file!=='favicon.ico')throw error}}
await build({entryPoints:['auth-gate.js'],bundle:true,format:'iife',platform:'browser',target:['es2020'],outfile:`${out}/auth-gate.js`,minify:true,sourcemap:false});
const template=await readFile('runtime-config.template.js','utf8'),url=process.env.POURGRID_SUPABASE_URL||'',key=process.env.POURGRID_SUPABASE_ANON_KEY||'';await writeFile(`${out}/runtime-config.js`,template.replace('__POURGRID_SUPABASE_URL__',url.replaceAll('"','\\"')).replace('__POURGRID_SUPABASE_ANON_KEY__',key.replaceAll('"','\\"')));
await cp('icons',`${out}/icons`,{recursive:true});
