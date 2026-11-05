import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const gateway = createServer((req, res) => { if (req.method !== 'POST' || req.headers.authorization !== 'Bearer verify-token') { res.writeHead(401); return res.end(); } req.resume(); req.on('end', () => { res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ captions: ['검증된 외부 자막'], captionCues: [{ start: 0, end: 2 }] })); }); });
await new Promise(resolve => gateway.listen(18788, '127.0.0.1', resolve));
const dataFile = join(tmpdir(), `skyclip-stt-${process.pid}-${Date.now()}.json`);
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: '18787', SKYCLIP_DATA_FILE: dataFile, SKYCLIP_STT_URL: 'http://127.0.0.1:18788/transcribe', SKYCLIP_STT_TOKEN: 'verify-token' }, stdio: ['ignore', 'pipe', 'pipe'] });
try { for (let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:18787/api/health')).ok)break}catch{} await new Promise(r=>setTimeout(r,100));} const capabilities=await (await fetch('http://127.0.0.1:18787/api/capabilities')).json(); const headers={'content-type':'application/json','x-workspace-id':'stt-verify'}; const project=await (await fetch('http://127.0.0.1:18787/api/projects',{method:'POST',headers,body:JSON.stringify({title:'STT 검증',source:'local-video',creditCost:0})})).json(); const upload=await (await fetch(`http://127.0.0.1:18787/api/projects/${project.id}/source`,{method:'POST',headers:{...headers,'content-type':'video/mp4','x-file-name':'verify.mp4'},body:await readFile(new URL('./test-input.mp4',import.meta.url))})).json(); const ok=capabilities.analysisProvider==='external-stt'&&capabilities.sttAuthenticated===true&&upload.project?.captions?.[0]==='검증된 외부 자막'; console.log(`${ok?'PASS':'FAIL'} external STT adapter`); if(!ok)process.exitCode=1; } finally { child.kill(); gateway.close(); }
