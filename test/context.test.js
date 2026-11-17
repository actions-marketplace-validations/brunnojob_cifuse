import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,markdown} from '../src/engine.js';
import {enrich,sourceLocations} from '../src/context.js';
const scan=text=>analyze([{name:'build.log',text}]);
test('extracts TS, compiler and Python paths but rejects traversal and absolute paths',()=>{
 assert.deepEqual(sourceLocations('src/a.ts(12,7): error TS2322\nsrc/b.c:4:2: error\nFile "app/main.py", line 8').map(x=>[x.path,x.line,x.column]),[['src/a.ts',12,7],['src/b.c',4,2],['app/main.py',8,null]]);
 assert.deepEqual(sourceLocations('../secret.js:4:2\n/etc/secret.js:4\nC:\\secret.js:4'),[]);
});
test('verifies source snippets, commit links and separate log evidence',()=>{
 const report=enrich(scan('src/a.ts(2,1): error TS2322: bad'),{'src/a.ts':'const a=1;\nconst b: number="bad";\n','package.json':'{"packageManager":"pnpm@10","engines":{"node":">=22"}}'},{repository:'owner/repo',commit:'a'.repeat(40)});
 const f=report.findings[0];assert.equal(f.locations[0].file,'build.log');assert.equal(f.locations[0].line,1);assert.equal(f.codeLocations[0].path,'src/a.ts');assert.equal(f.codeLocations[0].line,2);assert.equal(f.codeLocations[0].verified,true);assert.match(f.codeLocations[0].url,/#L2$/);assert.equal(report.context.packageManager,'pnpm@10');assert.match(markdown(report),/const b/);
});
test('missing source or invalid line never becomes a verified link',()=>{
 const r=enrich(scan('src/a.ts:99: error TS2322: bad'),{'src/a.ts':'a'},{repository:'a/b',commit:'a'.repeat(40)});assert.equal(r.findings[0].codeLocations[0].verified,false);assert.equal(r.findings[0].codeLocations[0].url,null);
});
test('prioritization identifies evidence without claiming causality',()=>{
 const r=enrich(scan('ENOTFOUND service\nFAIL test/auth\nProcess completed with exit code 1'));
 assert.equal(r.findings[0].role,'investigate-first');assert.equal(r.findings.at(-1).role,'possible-consequence');assert.equal(r.investigation.confidence,'heuristic');
});
test('source snippets and config values are redacted',()=>{
 const r=enrich(scan('src/a.ts:1: error TS2322: bad'),{'src/a.ts':'const TOKEN="veryprivate";','package.json':'{"packageManager":"TOKEN=veryprivate"}'});assert.ok(!JSON.stringify(r).includes('veryprivate'));
});
test('inspects source imports and declared dependencies using supplied code',()=>{
 const r=enrich(scan("Error: Cannot find module './utils.js' imported from src/main.js:1:1"),{'src/main.js':"import {n} from './utils.js';",'src/Utils.js':'export const n=1;'});
 assert.equal(r.findings[0].codeDiagnostics[0].status,'case-mismatch');assert.deepEqual(r.findings[0].codeDiagnostics[0].candidates,['src/Utils.js']);
 const dependency=enrich(scan("Cannot find module 'react/jsx-runtime'"),{'package.json':'{"dependencies":{"react":"^19.0.0"}}'}).findings[0].dependency;
 assert.deepEqual(dependency,{name:'react',declared:true,version:'^19.0.0'});
});
