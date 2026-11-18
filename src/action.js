import {appendFile,readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {markdown} from './engine.js';
import {upsertComment} from './github.js';
if(process.env.CIFUSE_LOG&&process.env.CIFUSE_RUN)throw Error('Provide either log or github-run, not both');
if(process.env.CIFUSE_COMMENT&&!['true','false'].includes(process.env.CIFUSE_COMMENT))throw Error('comment must be true or false');
if(/[\r\n]/.test(process.env.CIFUSE_OUTPUT||''))throw Error('output path must not contain line breaks');
const args=[fileURLToPath(new URL('../bin/cifuse.js',import.meta.url)),'--format','json','--lang',process.env.CIFUSE_LANG||'en'];
if(process.env.CIFUSE_LOG)args.push(process.env.CIFUSE_LOG);
else if(process.env.CIFUSE_RUN)args.push('--github-run',process.env.CIFUSE_RUN);
else throw Error('Provide log or github-run');
if(process.env.CIFUSE_REPO)args.push('--repo',process.env.CIFUSE_REPO);
if(process.env.CIFUSE_REPOSITORY)args.push('--repository',process.env.CIFUSE_REPOSITORY);
if(process.env.CIFUSE_COMMIT)args.push('--commit',process.env.CIFUSE_COMMIT);
if(process.env.CIFUSE_BASELINE)args.push('--baseline',process.env.CIFUSE_BASELINE);
if(process.env.CIFUSE_FAIL_ON)args.push('--fail-on',process.env.CIFUSE_FAIL_ON);
const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:32*1024*1024});
if(result.error)throw result.error;
if(result.stderr)process.stderr.write(result.stderr);
if(result.stdout){
  const report=JSON.parse(result.stdout),body=markdown(report);
  if(process.env.GITHUB_STEP_SUMMARY){
    const limit=900*1024,buffer=Buffer.from(body);
    await appendFile(process.env.GITHUB_STEP_SUMMARY,buffer.length>limit?buffer.subarray(0,limit).toString('utf8')+'\n\nReport truncated for GitHub summary limits. Download the JSON report for complete evidence.\n':body);
  }
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`groups=${report.summary.groups}\nsignals=${report.summary.signals}\nnew=${report.summary.new??''}\nresolved=${report.summary.resolved??''}\n`);
  if(process.env.CIFUSE_OUTPUT){await mkdir(dirname(process.env.CIFUSE_OUTPUT),{recursive:true});await writeFile(process.env.CIFUSE_OUTPUT,JSON.stringify(report,null,2));if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`report=${process.env.CIFUSE_OUTPUT.replace(/[\r\n]/g,'')}\n`);}
  if(process.env.CIFUSE_COMMENT==='true'){
    if(!process.env.GITHUB_TOKEN)throw Error('PR comments require token and pull-requests: write');
    const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
    if(!event.pull_request?.number)throw Error('PR comment requires a pull_request event');
    await upsertComment(process.env.GITHUB_REPOSITORY,event.pull_request.number,body);
  }
}
process.exitCode=result.status??2;
