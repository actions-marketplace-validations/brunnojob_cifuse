// Shared, filesystem-free enrichment for CLI, Action and browser.
import {redact} from './engine.js';
export function sourceLocations(text) {
  const found=[];
  for(const match of text.matchAll(/(?:File "([^"\n]+)", line (\d+)|((?:[A-Za-z]:[\\/])?[\w@.\/\\-]+\.[\w]+)(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\)))/g)) {
    const path=(match[1]||match[3]).replaceAll('\\','/').replace(/^\.\//,'');
    if(path.startsWith('/')||path.includes('../')||/^[A-Za-z]:/.test(path))continue;
    found.push({path,line:Number(match[2]||match[4]||match[6]),column:Number(match[5]||match[7])||null});
  }
  return found;
}
export function inspectImports(files) {
  const paths=Object.keys(files),diagnostics=[];
  for(const [path,text] of Object.entries(files)) {
    if(!/\.[cm]?[jt]sx?$/.test(path))continue;
    for(const m of text.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])(\.[^'"\n]+)\1/g)) {
      const specifier=m[2],parts=(path.slice(0,path.lastIndexOf('/')+1)+specifier).split('/'),normalized=[];
      for(const part of parts){if(part==='..')normalized.pop();else if(part&&part!=='.')normalized.push(part);}
      const target=normalized.join('/'),extensions=['','.ts','.tsx','.js','.jsx','.mts','.mjs','/index.ts','/index.tsx','/index.js'];
      // TypeScript commonly imports emitted .js paths while the source is .ts.
      const emitted=/\.[cm]?js$/.test(target)?[target.replace(/\.js$/,'.ts').replace(/\.mjs$/,'.mts').replace(/\.cjs$/,'.cts')]:[];
      if(extensions.some(ext=>paths.includes(target+ext))||emitted.some(p=>paths.includes(p)))continue;
      const matches=[...new Set(extensions.flatMap(ext=>paths.filter(p=>p.toLowerCase()===(target+ext).toLowerCase())))];
      diagnostics.push({path,line:text.slice(0,m.index).split('\n').length,specifier,status:matches.length===1?'case-mismatch':matches.length>1?'ambiguous':'unresolved-in-supplied-files',candidates:matches});
    }
  }
  return diagnostics;
}
export function enrich(report,files={}, {repository,commit}={}) {
  const pt=report.lang==='pt-BR',t=(en,br)=>pt?br:en;
  let pkg;try{pkg=JSON.parse(files['package.json']||'{}');}catch{}
  report.context={packageManager:pkg?.packageManager?redact(pkg.packageManager):null,node:pkg?.engines?.node?redact(pkg.engines.node):null,workflows:Object.keys(files).filter(p=>/^\.github\/workflows\/.*\.ya?ml$/.test(p)),sourceFiles:Object.keys(files).length,workflowSetup:Object.entries(files).filter(([p])=>/^\.github\/workflows\/.*\.ya?ml$/.test(p)).map(([path,text])=>({path,nodeVersions:[...text.matchAll(/node-version:\s*['"]?([\w.><=^~ -]+)/g)].map(m=>redact(m[1].trim())),runners:[...text.matchAll(/runs-on:\s*['"]?([\w.-]+)/g)].map(m=>m[1])}))};
  const imports=inspectImports(files);
  for(const f of report.findings) {
    f.codeLocations=[];
    for(const loc of f.locations)for(const location of sourceLocations(loc.context.join('\n'))) {
      if(f.codeLocations.some(l=>l.path===location.path&&l.line===location.line))continue;
      const content=files[location.path],lines=content?.split(/\r?\n/);
      const verified=!!lines&&location.line>0&&location.line<=lines.length;
      f.codeLocations.push({...location,verified,snippet:verified?lines.slice(Math.max(0,location.line-3),location.line+2).map((text,i)=>({line:Math.max(1,location.line-2)+i,text:redact(text)})):[],url:verified&&/^[\w.-]+\/[\w.-]+$/.test(repository||'')&&/^[a-f0-9]{40}$/.test(commit||'')?`https://github.com/${repository}/blob/${commit}/${location.path.split('/').map(encodeURIComponent).join('/')}#L${location.line}`:null});
    }
    f.codeDiagnostics=imports.filter(d=>f.rule==='missing-module'&&(f.locations.some(l=>l.context.join('\n').includes(d.specifier))||f.codeLocations.some(l=>l.path===d.path&&Math.abs(l.line-d.line)<=2)));
    f.diagnosis={confidence:'pattern',evidence:[f.evidence],checks:[f.hint]};
    if(f.rule==='lockfile-drift'&&pkg)f.diagnosis.checks.push(t(`Project package manager: ${redact(pkg.packageManager||'not declared')}. Regenerate the matching lockfile and review the diff.`,`Gerenciador do projeto: ${redact(pkg.packageManager||'não declarado')}. Regenere o lockfile correspondente e revise o diff.`));
    if(f.rule==='command-missing'&&report.context.workflows.length)f.diagnosis.checks.push(t('Inspect tool setup and PATH in: ','Inspecione a instalação da ferramenta e PATH em: ')+report.context.workflows.join(', '));
    if(f.rule==='missing-module'&&pkg){
      const match=/(?:Cannot find module|Cannot find package|Can't resolve)\s+['"]([^'"]+)['"]/.exec(f.evidence);
      if(match&&!match[1].startsWith('.')){const name=match[1].startsWith('@')?match[1].split('/').slice(0,2).join('/'):match[1].split('/')[0];const version=pkg.dependencies?.[name]||pkg.devDependencies?.[name]||pkg.peerDependencies?.[name]||null;f.dependency={name,declared:!!version,version:version?redact(version):null};f.diagnosis.checks.push(t(`Dependency ${name}: ${version?'declared as '+redact(version):'not declared in the supplied package.json'}. Check workspace and installation steps.`,`Dependência ${name}: ${version?'declarada como '+redact(version):'não declarada no package.json fornecido'}. Verifique workspace e instalação.`));}
    }
    if(f.rule==='missing-module')f.diagnosis.checks.push(t('Check import casing against tracked files; Linux paths are case sensitive.','Compare maiúsculas/minúsculas do import com os arquivos versionados; caminhos no Linux diferenciam caixa.'));
  }
  const candidates=report.findings.filter(f=>!['generic-error','test-failure'].includes(f.rule));
  const first=candidates[0]||report.findings[0];
  report.investigation={primarySignature:first?.signature||null,confidence:'heuristic',explanation:t('First specific diagnostic is the investigation starting point, not a proven cause. Later exit-status messages may be consequences.','O primeiro diagnóstico específico é o ponto de partida, não uma causa comprovada. Mensagens posteriores de saída podem ser consequências.')};
  for(const f of report.findings)f.role=f===first?'investigate-first':f.rule==='generic-error'&&/exit code|Process completed/.test(f.evidence)?'possible-consequence':'independent-or-related';
  return report;
}
