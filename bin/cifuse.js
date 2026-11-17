#!/usr/bin/env node
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {enrich} from '../src/context.js';
import {readRepository,git} from '../src/repository.js';
import {repair,validateCommand} from '../src/repair.js';
import {runLogs} from '../src/github.js';
import {fileURLToPath} from 'node:url';
import {analyze,markdown,MAX_BYTES} from '../src/engine.js';
const usage=`CIFuse 0.2.0 — evidence first CI triage
Usage: cifuse [file.log ... | - | --demo] [--format json|markdown] [--lang en|pt-BR]
              [--baseline report.json] [--fail-on findings|new]
Exit: 0 completed, 1 threshold matched, 2 input/usage error.
Input limit: 5 MiB total, 100 files. Analysis is offline by default.
  --repo PATH                 Read tracked source/config files for context
  --repository OWNER/REPO     Link verified source locations (requires --commit)
  --commit SHA                Commit matching the supplied source checkout
  --github-run OWNER/REPO/ID   Download failed job logs (GITHUB_TOKEN optional)
  --validate '["node","--test"]' Run explicit argv in repository checkout
  --fix --patch PATH          Reproduce, repair and validate in temporary worktree
  --open-pr                   Push validated repair and open PR (git/gh auth required)
Validation executes project code. Only use trusted repositories and commands.`;
async function main() {
  const args=process.argv.slice(2), files=[],options={}; let format='markdown',failOn,repo,repository,commit,githubRun,command,fix=false,patchPath,openPr=false;
  const take=()=>{const value=args.shift();if(!value||value.startsWith('--'))throw Error('Missing option value');return value;};
  while(args.length) {
    const arg=args.shift();
    if(arg==='--help'||arg==='-h'){console.log(usage);return;}
    if(arg==='--version'){console.log('0.2.0');return;}
    if(arg==='--repo')repo=resolve(take());
    else if(arg==='--repository')repository=take();
    else if(arg==='--commit')commit=take();
    else if(arg==='--github-run')githubRun=take();
    else if(arg==='--validate')command=JSON.parse(take());
    else if(arg==='--fix')fix=true;
    else if(arg==='--patch')patchPath=resolve(take());
    else if(arg==='--open-pr')openPr=true;
    else if(arg==='--format')format=take();
    else if(arg==='--lang')options.lang=take();
    else if(arg==='--baseline')options.baseline=JSON.parse(await boundedRead(take()));
    else if(arg==='--fail-on')failOn=take();
    else if(arg==='--demo')files.push(fileURLToPath(new URL('../examples/build.log',import.meta.url)));
    else if(arg.startsWith('-')&&arg!=='-')throw Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if(!['json','markdown'].includes(format))throw Error('Format must be json or markdown');
  if(options.lang&&!['en','pt-BR'].includes(options.lang))throw Error('Language must be en or pt-BR');
  if(failOn&&!['findings','new'].includes(failOn))throw Error('Threshold must be findings or new');
  if(failOn==='new'&&!options.baseline)throw Error('--fail-on new requires --baseline');
  if((fix||command)&&!repo)throw Error('--fix/--validate requires --repo');
  if(openPr&&!fix)throw Error('--open-pr requires --fix');
  if(patchPath&&!fix)throw Error('--patch requires --fix');
  if(fix&&!patchPath&&!openPr)throw Error('--fix requires --patch or --open-pr');
  if(!files.length&&!githubRun)throw Error('Provide a log path, - for stdin, or --demo');
  if(files.length>100)throw Error('Maximum 100 files');
  let size=0;const sources=[];
  for(const file of files){
    const text=file==='-'?await readStdin():await boundedRead(file);
    size+=Buffer.byteLength(text)+Buffer.byteLength(file);if(size>MAX_BYTES)throw Error('Input exceeds 5 MiB');
    sources.push({name:file==='-'?'stdin':file,text});
  }
  if(githubRun){const remote=await runLogs(githubRun);sources.push(...remote.sources);repository=remote.repository;commit=remote.commit;}
  const code=repo?await readRepository(repo):{};
  if(repo&&commit&&git(repo,['rev-parse','HEAD'])!==commit)throw Error('Source checkout must match --commit / workflow head SHA');
  if(repo&&git(repo,['status','--porcelain','--untracked-files=no'])&&commit)throw Error('Source links require an unmodified checkout');
  const report=enrich(analyze(sources,options),code,{repository,commit});
  if(fix)report.repair=await repair(repo,report,{command,patchPath,openPr,repository});
  else if(command)report.validation=validateCommand(command,repo);
  if((report.validation&&!report.validation.passed)||(report.repair&&report.repair.status!=='validated'))process.exitCode=1;
  console.log(format==='json'?JSON.stringify(report,null,2):markdown(report));
  if((failOn==='findings'&&report.findings.length)||(failOn==='new'&&report.summary.new))process.exitCode=1;
}
async function boundedRead(path){const s=await stat(path);if(!s.isFile()||s.size>MAX_BYTES)throw Error('Expected regular file of at most 5 MiB');const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>MAX_BYTES)throw Error('Input exceeds 5 MiB');return text;}
async function readStdin(){const chunks=[];let n=0;for await(const chunk of process.stdin){n+=chunk.length;if(n>MAX_BYTES)throw Error('Input exceeds 5 MiB');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
main().catch(e=>{console.error(`CIFuse: ${e.message}`);process.exitCode=2;});
