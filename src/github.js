import {redact} from './engine.js';
export async function github(path,{token=process.env.GITHUB_TOKEN,method='GET',body}={}){
  const response=await fetch(`https://api.github.com${path}`,{method,headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`GitHub ${response.status}: ${path}`);
  return response.json();
}
export async function runLogs(spec){
  const m=/^([\w.-]+\/[\w.-]+)\/(\d+)$/.exec(spec);if(!m)throw Error('Run must be owner/repo/run-id');
  const [,repository,id]=m,run=await github(`/repos/${repository}/actions/runs/${id}`),sources=[];
  for(let page=1;page<=10;page++){
    const {jobs}=await github(`/repos/${repository}/actions/runs/${id}/jobs?per_page=100&page=${page}`);
    for(const job of jobs.filter(j=>['failure','timed_out'].includes(j.conclusion))){
      const response=await fetch(`https://api.github.com/repos/${repository}/actions/jobs/${job.id}/logs`,{headers:process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Cannot download job ${job.id}: ${response.status}`);
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>5*1024*1024)throw Error('Job log exceeds 5 MiB');chunks.push(value);}}finally{await reader.cancel();}
      sources.push({name:`job-${job.id}.log`,text:Buffer.concat(chunks).toString('utf8')});
      if(sources.length>100||sources.reduce((n,s)=>n+Buffer.byteLength(s.text),0)>5*1024*1024)throw Error('Run logs exceed input limits');
    }
    if(jobs.length<100)break;
    if(page===10)throw Error('Run exceeds 1000 jobs; select smaller logs instead');
  }
  return {sources,repository,commit:run.head_sha};
}
export async function upsertComment(repository,pr,body){
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^\d+$/.test(String(pr)))throw Error('Invalid repository or PR');
  const marker='<!-- cifuse-report -->';let me;try{me=await github('/user');}catch(e){if(!e.message.includes('GitHub 403:'))throw e;me={login:'github-actions[bot]'};}let existing;
  for(let page=1;page<=20;page++){const list=await github(`/repos/${repository}/issues/${pr}/comments?per_page=100&page=${page}`);existing=list.find(c=>(me.id?c.user.id===me.id:c.user.login===me.login)&&c.body?.startsWith(marker));if(existing||list.length<100)break;}
  return github(existing?`/repos/${repository}/issues/comments/${existing.id}`:`/repos/${repository}/issues/${pr}/comments`,{method:existing?'PATCH':'POST',body:{body:marker+'\n'+redact(body).slice(0,60000)}});
}
