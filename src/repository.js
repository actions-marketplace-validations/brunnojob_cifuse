import {execFileSync} from 'node:child_process';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
export function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:8*1024*1024}).trim();}
export async function readRepository(root){
  root=await realpath(root);const files={};let size=0;
  const paths=git(root,['ls-files','-z']).split('\0').filter(Boolean);
  for(const path of paths){
    if(!/\.(?:[cm]?[jt]sx?|py|rs|go|c|cpp|h|cs|json|ya?ml)$/.test(path)||/(^|\/)(node_modules|vendor|dist)\//.test(path)||/(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)/.test(path))continue;
    const abs=resolve(root,path),rel=relative(root,abs);if(rel.startsWith('..')||isAbsolute(rel))continue;
    const s=await lstat(abs).catch(()=>null);if(!s?.isFile()||s.isSymbolicLink()||s.size>128*1024)continue;
    const real=await realpath(abs);if(relative(root,real).startsWith('..'))continue;
    size+=s.size;if(size>4*1024*1024||Object.keys(files).length>=500)break;
    files[path]=await readFile(abs,'utf8');
  }
  return files;
}
