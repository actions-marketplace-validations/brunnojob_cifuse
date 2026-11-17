// Capture actual Node diagnostics, never invent or relabel production incidents.
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const cases=[
 ['node-missing-package',"require('cifuse-deliberately-absent-package')",'missing-module'],
 ['node-assertion',"require('node:assert/strict').equal(1,2)",'test-failure'],
 ['node-refused-service',"fetch('http://127.0.0.1:1').catch(e=>{console.error(e);process.exitCode=1})",'generic-error'],
 ['node-success',"console.log('All checks passed')",null],
 ['node-zero-errors',"console.log('0 errors; 12 tests passed')",null]
];
const fixtures=cases.map(([name,script,expected])=>{const r=spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:10000});if(r.error)throw r.error;return {name,expected,command:['node','-e',script],exitCode:r.status,text:r.stdout+r.stderr};});
await writeFile('test/fixtures/node-diagnostics.json',JSON.stringify({provenance:{kind:'reproduced-tool-diagnostics',node:process.version,capturedAt:new Date().toISOString(),note:'Actual local tool output from intentionally failing commands; not production incident data.'},fixtures},null,2)+'\n');
