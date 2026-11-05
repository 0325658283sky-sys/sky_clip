import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = 18789; const secret = 'verify-workspace-secret'; const workspace = 'signed-workspace'; const signature = createHmac('sha256', secret).update(workspace).digest('hex'); const dataFile = join(tmpdir(), `skyclip-auth-${process.pid}-${Date.now()}.json`);
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: dataFile, SKYCLIP_WORKSPACE_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'] });
try { for (let i=0;i<30;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break}catch{} await new Promise(r=>setTimeout(r,100));} const base=`http://127.0.0.1:${port}`; const good={cookie:`skyclip_workspace=${workspace}.${signature}`}; const bad={cookie:`skyclip_workspace=${workspace}.bad`}; const capabilities=await (await fetch(`${base}/api/capabilities`)).json(); const session=await (await fetch(`${base}/api/session`,{headers:good})).json(); const isolated=await (await fetch(`${base}/api/projects`,{headers:bad})).json(); const ok=capabilities.authMode==='signed-workspace'&&capabilities.workspaceAuthConfigured===true&&session.authenticated===true&&session.workspaceId===workspace&&isolated.projects?.length===0; console.log(`${ok?'PASS':'FAIL'} signed workspace auth`); if(!ok)process.exitCode=1; } finally { child.kill(); }
