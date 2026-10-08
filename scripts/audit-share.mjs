import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=process.env.GIT_BIN??'git';
const run=args=>execFileSync(git,args,{encoding:'utf8',maxBuffer:16*1024*1024});
const forbiddenPaths=/(^|\/)(\.private|\.runtime|node_modules|tools|cleanup-archive)(\/|$)|(^|\/)(\.env[^/]*|client_secret[^/]*|health\.url|foreground\.pid)$|\.(dpapi|exe|log|zip)$/i;
const rules=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/],
  ['google-access-token',/\bya29\.[A-Za-z0-9_-]{20,}/],
  ['google-refresh-token',/\b1\/\/[A-Za-z0-9_-]{30,}/],
  ['openai-key',/\bsk-(?:proj-|admin-)?[A-Za-z0-9_-]{20,}/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['google-oauth-client-id',/\b\d{8,}-[a-z0-9]+\.apps\.googleusercontent\.com/],
  ['private-machine-path',/[A-Za-z]:[\\/]Users[\\/][^\s"']+/],
  ['non-example-email',/[\w.+-]+@(?!example\.(?:com|test|invalid)\b|users\.noreply\.github\.com\b|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i],
  ['bound-tunnel-or-plugin-id',/\b(?:tunnel_|plugins_|pluginrel)[a-f0-9]{16,}/]
];
export function inspectText(name,text){
  const issues=[];if(forbiddenPaths.test(name))issues.push('generated-or-private-path');
  for(const [kind,pattern]of rules)if(pattern.test(text))issues.push(kind);
  return issues;
}
if(process.argv[1]?.endsWith('audit-share.mjs')){
  const problems=[];
  function inspect(name,text){for(const issue of inspectText(name,text))problems.push({file:name,kind:issue});}
  const tracked=run(['ls-files','-z']).split('\0').filter(Boolean);
  for(const name of tracked)inspect(name,readFileSync(name,'utf8'));
  let commits=[];try{commits=run(['rev-list','--all']).trim().split('\n').filter(Boolean);}catch{}
  let blobs=0;
  for(const commit of commits){
    inspect('commit-metadata',run(['show','-s','--format=%an <%ae>%n%cn <%ce>%n%B',commit]));
    const records=run(['ls-tree','-r','-z',commit]).split('\0').filter(Boolean);
    for(const record of records){const [meta,name]=record.split('\t');const [mode,type,id]=meta.split(' ');if(type!=='blob')continue;blobs++;inspect(name,run(['cat-file','blob',id]));}
  }
  if(problems.length){console.error(JSON.stringify({result:'FAIL',issues:problems}));process.exitCode=1;}
  else console.log(JSON.stringify({result:'PASS',trackedFiles:tracked.length,commits:commits.length,historyBlobs:blobs,scope:'tracked files plus all reachable commits; no credentials or personal-account/machine data detected',limitation:'pattern audit and manual source review; not a cryptographic absence proof'}));
}
