import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--tunnel-id'||!/^tunnel_[a-zA-Z0-9_-]+$/.test(args[1]))throw Error('USAGE: --tunnel-id your-own-tunnel-id');
const root=resolve(import.meta.dirname,'..'),target=resolve(root,'connection/profiles/google-tasks.yaml');
if(existsSync(target))throw Error('PROFILE_ALREADY_EXISTS');
mkdirSync(resolve(root,'connection/profiles'),{recursive:true});
const command=JSON.stringify(process.execPath.replaceAll('\\','/'))+' '+JSON.stringify(resolve(root,'src/server.mjs').replaceAll('\\','/'));
const yaml=`config_version: 1
control_plane:
  base_url: "https://api.openai.com"
  tunnel_id: ${JSON.stringify(args[1])}
  api_key: "env:CONTROL_PLANE_API_KEY"
health:
  listen_addr: "127.0.0.1:0"
admin_ui:
  open_browser: false
  log_buffer_events: 1
log:
  level: error
  format: json
  http_raw_unsafe: false
mcp:
  commands:
    - channel: main
      command: ${JSON.stringify(command)}
`;
writeFileSync(target,yaml,{flag:'wx'});
console.log('LOCAL_TUNNEL_PROFILE_CREATED_NO_KEY_STORED_NO_TUNNEL_CREATED_OR_STARTED');
