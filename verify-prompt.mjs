import { spawn } from 'node:child_process';

const port = 18987;
const child = spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: `${process.cwd()}\\.prompt-verify.json` }, stdio: ['ignore', 'pipe', 'pipe'] });
let startupError = '';
child.stderr.on('data', chunk => { startupError += chunk.toString(); });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  if (!ready) throw new Error(`server start timeout${startupError ? `: ${startupError.trim()}` : ''}`);
  const headers = { 'content-type': 'application/json', 'x-workspace-id': 'prompt-verify' };
  const sample = await (await fetch(`${base}/api/projects/sample`, { method: 'POST', headers })).json();
  const response = await fetch(`${base}/api/projects/${sample.id}/prompt-clips`, { method: 'POST', headers, body: JSON.stringify({ prompt: '발표자가 핵심 결론을 말하는 장면을 30초로 만들어줘' }) });
  if (response.status !== 202) throw new Error(`unexpected status ${response.status}`);
  const logs = await (await fetch(`${base}/api/projects/${sample.id}/logs`, { headers })).json();
  if (!(logs.logs || []).some(log => log.message.includes('프롬프트 클립 생성 요청'))) throw new Error('prompt log missing');
  console.log('PASS prompt clip request');
} finally { child.kill('SIGINT'); }
