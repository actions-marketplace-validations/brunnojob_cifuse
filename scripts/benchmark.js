import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {analyze} from '../src/engine.js';
const {fixtures,provenance}=JSON.parse(await readFile(new URL('../test/fixtures/node-diagnostics.json',import.meta.url),'utf8'));
let detected=0,positives=0,falsePositives=0;const start=performance.now();
for(const f of fixtures){const report=analyze([{name:f.name,text:f.text}]);if(f.expected){positives++;if(report.findings.some(r=>r.rule===f.expected))detected++;}else if(report.findings.length)falsePositives++;}
console.log(JSON.stringify({provenance,cases:fixtures.length,expectedFailures:positives,detected,negativeControls:fixtures.length-positives,falsePositives,elapsedMs:Number((performance.now()-start).toFixed(2)),scope:'Small reproducible corpus; does not establish general accuracy or developer time savings.'},null,2));
if(detected!==positives||falsePositives)process.exitCode=1;
