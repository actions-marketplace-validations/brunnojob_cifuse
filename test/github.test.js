import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runLogs,upsertComment} from '../src/github.js';
test('imports failed jobs and preserves workflow head SHA',async()=>{
 const old=globalThis.fetch,calls=[];
 globalThis.fetch=async(url)=>{calls.push(url);if(url.endsWith('/runs/123'))return Response.json({head_sha:'a'.repeat(40)});if(url.includes('/jobs?'))return Response.json({jobs:[{id:8,conclusion:'failure'},{id:9,conclusion:'success'}]});return new Response('ENOSPC');};
 try{const r=await runLogs('owner/repo/123');assert.equal(r.sources.length,1);assert.equal(r.sources[0].text,'ENOSPC');assert.equal(r.commit,'a'.repeat(40));assert.equal(calls.length,3);await assert.rejects(runLogs('https://other/1'),/owner\/repo/);}finally{globalThis.fetch=old;}
});
test('updates only its own marked PR report, not another users comment',async()=>{
 const old=globalThis.fetch;let updated;
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/user'))return Response.json({id:10});if(options.method==='PATCH'){updated={url,body:JSON.parse(options.body).body};return Response.json({id:2});}return Response.json([{id:1,user:{id:20},body:'<!-- cifuse-report --> malicious'},{id:2,user:{id:10},body:'<!-- cifuse-report --> old'}]);};
 try{await upsertComment('owner/repo',1,'new report');assert.match(updated.url,/comments\/2$/);assert.match(updated.body,/new report/);}finally{globalThis.fetch=old;}
});
test('supports GitHub Actions installation token identity',async()=>{
 const old=globalThis.fetch;let url;
 globalThis.fetch=async(u,o)=>{if(u.endsWith('/user'))return new Response('',{status:403});if(o.method==='PATCH'){url=u;return Response.json({});}return Response.json([{id:5,user:{login:'github-actions[bot]',type:'Bot'},body:'<!-- cifuse-report --> old'}]);};
 try{await upsertComment('owner/repo',1,'report');assert.match(url,/comments\/5$/);}finally{globalThis.fetch=old;}
});
