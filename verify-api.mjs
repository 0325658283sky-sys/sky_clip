import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = 18787;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: join(tmpdir(), 'skyclip-verify-data.json') },
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
const waitForProject = async (id, headers, predicate) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const project = await (await fetch(`${base}/api/projects/${id}`, { headers })).json();
    if (predicate(project)) return project;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return await (await fetch(`${base}/api/projects/${id}`, { headers })).json();
};

try {
  await waitForServer();
  const health = await (await fetch(`${base}/api/health`)).json();
  const workspaceHeaders = { 'x-workspace-id': 'verify-workspace' };
  const isolatedHeaders = { 'x-workspace-id': 'isolated-workspace' };
  const session = await (await fetch(`${base}/api/session`, { headers: workspaceHeaders })).json();
  const projects = await (await fetch(`${base}/api/projects`)).json();
  const isolatedProjects = await (await fetch(`${base}/api/projects`, { headers: { 'x-workspace-id': 'isolated-workspace' } })).json();
  const credits = await (await fetch(`${base}/api/credits`)).json();
  const created = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ title: '결과 API 검증', source: 'https://example.com/video', creditCost: 0, requestId: `verify-${Date.now()}` }) })).json();
  const upload = await (await fetch(`${base}/api/projects/${created.id}/source`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'verify.mp4', ...workspaceHeaders }, body: await readFile(new URL('./test-input.mp4', import.meta.url)) })).json();
  const assetRecord = await (await fetch(`${base}/api/projects/${created.id}/assets`, { method: 'POST', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ type: '음악', prompt: 'verify-audio', fileName: 'verify-audio.mp4' }) })).json();
  const assetFile = await (await fetch(`${base}/api/projects/${created.id}/assets/file`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'verify-audio.mp4', 'x-asset-prompt': 'verify-audio', ...workspaceHeaders }, body: await readFile(new URL('./test-input.mp4', import.meta.url)) })).json();
  await fetch(`${base}/api/projects/${created.id}/assets`, { method: 'POST', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ type: '영상', prompt: 'verify-visual', fileName: 'verify-visual.mp4' }) });
  const visualFile = await (await fetch(`${base}/api/projects/${created.id}/assets/file`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'verify-visual.mp4', 'x-asset-prompt': 'verify-visual', ...workspaceHeaders }, body: await readFile(new URL('./test-input.mp4', import.meta.url)) })).json();
  await fetch(`${base}/api/projects/${created.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ editorState: { visualAsset: { type: '영상', prompt: 'verify-visual', fileName: 'verify-visual.mp4' }, clipStart: 0, clipEnd: 3 }, workspaceId: 'attacker-workspace' }) });
  await fetch(`${base}/api/projects/${created.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ clipStart: 0, clipEnd: 3 }) });
  const renderedProject = await waitForProject(created.id, workspaceHeaders, project => ['processing', 'ready', 'failed'].includes(project.exportStatus));
  await new Promise(resolve => setTimeout(resolve, 1100));
  const results = await (await fetch(`${base}/api/projects/${created.id}/results`, { headers: workspaceHeaders })).json();
  const analysis = await (await fetch(`${base}/api/projects/${created.id}/analysis`, { headers: workspaceHeaders })).json();
  const exportRequest = await (await fetch(`${base}/api/projects/${created.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify({ clipStart: 12, clipEnd: 42 }) })).json();
  const exportedProject = await (await fetch(`${base}/api/projects/${created.id}`, { headers: workspaceHeaders })).json();
  const crossWorkspaceChecks = await Promise.all([
    fetch(`${base}/api/projects/${created.id}`, { headers: isolatedHeaders }),
    fetch(`${base}/api/projects/${created.id}/reprocess`, { method: 'POST', headers: isolatedHeaders }),
    fetch(`${base}/api/projects/${created.id}/captions`, { method: 'POST', headers: isolatedHeaders }),
    fetch(`${base}/api/projects/${created.id}/assets`, { method: 'POST', headers: { 'content-type': 'application/json', ...isolatedHeaders }, body: '{}' }),
    fetch(`${base}/api/projects/${created.id}/assets`, { method: 'DELETE', headers: { 'content-type': 'application/json', ...isolatedHeaders }, body: JSON.stringify({ prompt: 'verify-audio' }) }),
    fetch(`${base}/api/projects/${created.id}/refund`, { method: 'POST', headers: isolatedHeaders }),
    fetch(`${base}/api/projects/${created.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...isolatedHeaders }, body: JSON.stringify({ title: '침범 시도' }) }),
    fetch(`${base}/api/projects/${created.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...isolatedHeaders }, body: '{}' })
  ]);
  const checks = [
    ['health', health.ok === true && health.service === 'skyclip'],
    ['session', session.authenticated === false && session.authMode === 'workspace' && session.workspaceId === 'verify-workspace'],
    ['projects', Array.isArray(projects.projects)],
    ['workspace-scope', Array.isArray(isolatedProjects.projects) && isolatedProjects.projects.length === 0],
    ['credits', Number.isFinite(credits.balance)],
    ['result-clips', Array.isArray(results.resultSet?.clips) && results.resultSet.clips.length === 6],
    ['analysis-state', analysis.analysis?.provider === 'local' && analysis.analysis?.stage === 'ready' && analysis.analysis.transcriptReady === true],
    ['source-upload', upload.ok === true && upload.project?.sourceType === 'upload' && Boolean(upload.project?.renderInput) && Number.isFinite(upload.project?.duration)],
    ['asset-file', assetRecord.prompt === 'verify-audio' && assetFile.ok === true && assetFile.assets?.some(asset => asset.prompt === 'verify-audio' && asset.filePath)],
    ['visual-composite', visualFile.ok === true && ['processing', 'ready'].includes(renderedProject.exportStatus)],
    ['export-range', exportRequest.status === 'queued' && exportedProject.editorState?.clipStart === 12 && exportedProject.editorState?.clipEnd === 42],
    ['workspace-mutation-boundary', crossWorkspaceChecks.every(response => response.status === 404) && exportedProject.workspaceId === 'verify-workspace']
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} API ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
} finally {
  child.kill();
}
