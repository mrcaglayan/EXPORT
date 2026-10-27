import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const backend=fileURLToPath(new URL('../',import.meta.url)),frontend=fileURLToPath(new URL('../../frontend/',import.meta.url));
const checks=[
  ['OpenAPI',backend,['scripts/check-openapi.js']],
  ['Frontend lint',frontend,['node_modules/eslint/bin/eslint.js','.']],
  ['Frontend build',frontend,['node_modules/vite/bin/vite.js','build']],
  ['Journal editor',frontend,['--test','scripts/journal-entry.test.mjs']],
  ...['foundation','auth','accounting','products','classification','inventory','receipts','reallocations','reservations','closing','corrections','purchasing','browser'].map(mode=>[mode,backend,['scripts/test-pr00.js',mode]]),
];
try {
  for(const [name,cwd,args] of checks){
    console.log(`\nPR-03A release gate: ${name}`);
    const child=spawn(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code??1));});
    if(code!==0)throw new Error(`${name} failed (exit ${code}).`);
  }
  console.log('\nPASS: PR-03A purchasing release gate, including existing domain and browser regressions.');
} catch(error){console.error(`FAIL: ${error.message}`);process.exitCode=1;}
