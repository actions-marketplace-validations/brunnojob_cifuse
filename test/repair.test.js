import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze} from '../src/engine.js';
import {planRepairs,repair} from '../src/repair.js';
import {git,readRepository} from '../src/repository.js';
const report=()=>analyze([{name:'ci.log',text:"Error: Cannot find module './utils.js' imported from src/main.js:1:1"}]);
test('repair planner only handles unique relative case mismatches with matching evidence',()=>{
 const files={'src/main.js':"import {n} from './utils.js';\n",'src/Utils.js':'export const n=1;'};
 assert.match(planRepairs(report(),files)[0].after,/Utils.js/);
 assert.deepEqual(planRepairs(report(),{...files,'src/UTILS.js':'export const n=2;'}),[]);
 assert.deepEqual(planRepairs(analyze([{name:'x',text:'ENOSPC'}]),files),[]);
 assert.deepEqual(planRepairs(report(),{...files,'src/utils.js':'export const n=3;'}),[]);
});
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'cifuse-test-'));try{
 git(root,['init','-b','main']);git(root,['config','user.name','Test']);git(root,['config','user.email','test@example.com']);await mkdir(join(root,'src'));await writeFile(join(root,'package.json'),'{"type":"module"}');await writeFile(join(root,'src/main.js'),"import {n} from './utils.js';\nif(n!==1)throw Error('bad');\n");await writeFile(join(root,'src/Utils.js'),'export const n=1;\n');git(root,['add','.']);git(root,['commit','-m','fixture']);await fn(root);
}finally{await rm(root,{recursive:true,force:true});}}
test('repair reproduces failure, validates patch and leaves original checkout untouched',()=>fixture(async root=>{
 const patch=join(tmpdir(),`cifuse-${Date.now()}.patch`);try{const r=await repair(root,report(),{command:[process.execPath,'-e',"if(require('node:fs').readFileSync('src/main.js','utf8').includes('./utils.js'))process.exit(1);import('./src/main.js')"],patchPath:patch});assert.equal(r.status,'validated');assert.notEqual(r.before.status,0);assert.equal(r.after.status,0);assert.match(await readFile(patch,'utf8'),/\+import.*Utils.js/);assert.match(await readFile(join(root,'src/main.js'),'utf8'),/utils.js/);assert.equal(git(root,['status','--porcelain']),'');assert.equal(git(root,['worktree','list','--porcelain']).split('worktree ').length,2);}finally{await rm(patch,{force:true});}
}));
test('passing baseline and failed validation never receive validated status',()=>fixture(async root=>{
 assert.equal((await repair(root,report(),{command:[process.execPath,'-e','process.exit(0)']})).status,'not-reproduced');
 assert.equal((await repair(root,report(),{command:[process.execPath,'-e','process.exit(1)']})).status,'failed');
 assert.equal((await repair(root,report(),{command:['nonexistent-cifuse-command']})).status,'validation-error');
}));
test('requires a clean repository and reads tracked source files',()=>fixture(async root=>{
 await writeFile(join(root,'src/main.js'),'changed');await assert.rejects(repair(root,report(),{command:[process.execPath,'src/main.js']}),/clean working tree/);assert.ok((await readRepository(root))['src/main.js']);
}));
