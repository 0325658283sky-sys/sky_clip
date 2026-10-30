import { spawn } from 'node:child_process';

const port = 18787;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += String(chunk); });
child.stderr.on('data', chunk => { output += String(chunk); });

const waitForServer = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`서버 시작 시간 초과\n${output}`);
};

try {
  await waitForServer();
  const health = await (await fetch(`${base}/api/health`)).json();
  const projects = await (await fetch(`${base}/api/projects`)).json();
  const credits = await (await fetch(`${base}/api/credits`)).json();
  const created = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '결과 API 검증', source: 'https://example.com/video', creditCost: 0, requestId: `verify-${Date.now()}` }) })).json();
  await new Promise(resolve => setTimeout(resolve, 1100));
  const results = await (await fetch(`${base}/api/projects/${created.id}/results`)).json();
  const checks = [
    ['health', health.ok === true && health.service === 'skyclip'],
    ['projects', Array.isArray(projects.projects)],
    ['credits', Number.isFinite(credits.balance)],
    ['result-clips', Array.isArray(results.resultSet?.clips) && results.resultSet.clips.length === 6]
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} API ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
} finally {
  child.kill();
}
