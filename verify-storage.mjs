import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = 18790; const root = join(tmpdir(), `skyclip-storage-${process.pid}-${Date.now()}`); const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: join(root, 'data.json'), SKYCLIP_UPLOAD_DIR: join(root, 'media'), SKYCLIP_RENDER_DIR: join(root, 'renders') }, stdio: ['ignore', 'pipe', 'pipe'] });
try { for (let i=0;i<30;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break}catch{} await new Promise(r=>setTimeout(r,100));} const capabilities=await (await fetch(`http://127.0.0.1:${port}/api/capabilities`)).json(); const ok=capabilities.storageMode==='configured-directory'; console.log(`${ok?'PASS':'FAIL'} configured storage directories`); if(!ok)process.exitCode=1; } finally { child.kill(); }
