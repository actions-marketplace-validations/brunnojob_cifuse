import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,posix} from 'node:path';
import {git,readRepository} from './repository.js';
import {redact} from './engine.js';
// Only rewrite a relative JS/TS import when exactly one tracked path matches by case.
export function planRepairs(report,files){
  if(!report.findings.some(f=>f.rule==='missing-module'))return [];
  const paths=Object.keys(files),changes=[];
  for(const [path,before] of Object.entries(files)){
    if(!/\.[cm]?[jt]sx?$/.test(path))continue;
    const edits=[];
    const after=before.replace(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])(\.[^'"\n]+)\1/g,(full,quote,spec)=>{
      if(!report.findings.some(f=>f.rule==='missing-module'&&f.locations.some(l=>l.context.join('\n').includes(spec))))return full;
      const target=posix.normalize(posix.join(posix.dirname(path),spec));
      if(target.startsWith('../'))return full;
      const extensions=['','.ts','.tsx','.js','.jsx','.mts','.mjs','/index.ts','/index.tsx','/index.js'];
      if(extensions.some(ext=>paths.includes(target+ext)))return full;
      const matches=extensions.flatMap(ext=>paths.filter(p=>p.toLowerCase()===(target+ext).toLowerCase()).map(p=>({p,ext})));
      if(matches.length!==1)return full;
      const {p,ext}=matches[0],base=ext?p.slice(0,-ext.length):p;
      let corrected=posix.relative(posix.dirname(path),base);if(!corrected.startsWith('.'))corrected='./'+corrected;
      edits.push({from:spec,to:corrected});return full.replace(quote+spec+quote,quote+corrected+quote);
    });
    if(after!==before)changes.push({path,before,after,reason:'relative-import-case',edits});
  }
  return changes;
}
export function validateCommand(command,cwd,timeout=120000){
  if(!Array.isArray(command)||!command.length||command.some(x=>typeof x!=='string')||!command[0]||command[0].startsWith('-'))throw Error('Validation command must be a JSON argv array');
  // No shell interpretation. npm uses its JS entry point for Windows portability.
  let [exe,...args]=command;
  if(process.platform==='win32'&&exe==='npm'&&process.env.npm_execpath){args=[process.env.npm_execpath,...args];exe=process.execPath;}
  const result=spawnSync(exe,args,{cwd,encoding:'utf8',timeout,maxBuffer:1024*1024,shell:false,env:{...process.env,GITHUB_TOKEN:'',GH_TOKEN:''}});
  return {command,status:result.status,passed:result.status===0&&!result.error,output:redact((result.stdout||'')+(result.stderr||'')).slice(-12000),error:result.error?.code||null};
}
export async function repair(root,report,{command,patchPath,openPr=false,repository}={}){
  if(!command)throw Error('Repair requires --validate with an explicit JSON argv array');
  if(git(root,['status','--porcelain']))throw Error('Repair requires a clean working tree');
  const parent=await mkdtemp(join(tmpdir(),'cifuse-')),work=join(parent,'checkout'),branch=`cifuse/repair-${Date.now()}`;
  let added=false;
  try{
    git(root,['worktree','add','--detach',work,'HEAD']);added=true;
    const files=await readRepository(work),changes=planRepairs(report,files);
    if(!changes.length)return {status:'unsupported',changes:[],reason:'No unambiguous supported repair found'};
    const before=validateCommand(command,work);
    if(before.error||before.status===null)return {status:'validation-error',before,changes:[]};
    if(before.passed)return {status:'not-reproduced',before,changes:[]};
    if(git(work,['status','--porcelain','--untracked-files=no']))throw Error('Validation modified tracked files; refusing to mix changes');
    for(const change of changes)await writeFile(join(work,change.path),change.after);
    const after=validateCommand(command,work);
    const expected=new Set(changes.map(c=>c.path));
    const dirty=git(work,['diff','--name-only','-z']).split('\0').filter(Boolean);
    if(dirty.some(p=>!expected.has(p)))throw Error('Validation modified unrelated files');
    for(const change of changes)if(await readFile(join(work,change.path),'utf8')!==change.after)throw Error('Validation changed the proposed repair');
    const patch=git(work,['diff','--no-ext-diff','--binary'])+'\n';
    const result={status:after.passed?'validated':'failed',changes:changes.map(({path,reason,edits})=>({path,reason,edits})),before,after};
    if(patchPath){await writeFile(patchPath,patch);result.patch=patchPath;}
    if(openPr){
      if(!after.passed)throw Error('PR requires passing validation');
      if(!/^[\w.-]+\/[\w.-]+$/.test(repository||''))throw Error('--open-pr requires --repository owner/repo');
      const origin=git(root,['remote','get-url','origin']);
      if(![ `https://github.com/${repository}.git`,`https://github.com/${repository}`,`git@github.com:${repository}.git`].includes(origin))throw Error('Origin does not match requested repository');
      git(work,['switch','-c',branch]);git(work,['add','--',...changes.map(c=>c.path)]);
      git(work,['-c','user.name=CIFuse','-c','user.email=cifuse@users.noreply.github.com','commit','-m','fix: correct relative import casing']);
      git(work,['push','origin',branch]);
      const pr=spawnSync('gh',['pr','create','--repo',repository,'--head',branch,'--title','fix: correct relative import casing','--body','CIFuse reproduced the failure and corrected unambiguous relative import casing. The explicitly selected validation command failed before and passed after the patch. Review the change and CI before merging.'],{cwd:work,encoding:'utf8',timeout:30000});
      if(pr.status!==0)throw Error(`Branch ${branch} pushed; PR creation failed: ${redact(pr.stderr||'gh unavailable')}`);
      result.pullRequest=pr.stdout.trim();
    }
    return result;
  }finally{if(added)git(root,['worktree','remove','--force',work]);await rm(parent,{recursive:true,force:true});}
}
