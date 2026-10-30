import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';

const projects = new Map();
const creditRequests = new Map();
let creditBalance = 300;
const root = fileURLToPath(new URL('.', import.meta.url));
const dataFile = join(root, 'skyclip-data.json');
await mkdir(join(root, 'renders'), { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
try {
  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  creditBalance = saved.creditBalance ?? 300;
  for (const project of saved.projects || []) projects.set(project.id, project);
} catch (error) {
  console.warn(`[SkyClip] 저장 데이터 로드 실패: ${error?.message || error}. 기본 상태로 시작합니다.`);
}
const persist = () => writeFile(dataFile, JSON.stringify({ creditBalance, projects: [...projects.values()] }, null, 2), 'utf8').catch(() => {});
const logProject = (id, message) => { const project = projects.get(id); if (!project) return; projects.set(id, { ...project, logs: [...(project.logs || []), { message, at: new Date().toISOString() }] }); persist(); };
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!requested.includes('..')) {
      try { const body = await readFile(join(root, requested)); res.writeHead(200, { 'content-type': mime[extname(requested)] || 'application/octet-stream' }); return res.end(body); } catch {}
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'skyclip' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, { projects: [...projects.values()] });
  if (req.method === 'GET' && url.pathname === '/api/credits') return json(res, 200, { balance: creditBalance, usage: [...projects.values()].filter(project => project.creditCost).map(project => ({ projectId: project.id, title: project.title, cost: project.creditCost, createdAt: project.updatedAt || project.createdAt })) });
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = raw ? JSON.parse(raw) : {};
    if (input.requestId && creditRequests.has(input.requestId)) return json(res, 200, creditRequests.get(input.requestId));
    const creditCost = Math.max(0, Number(input.creditCost || 0));
    if (creditCost > creditBalance) return json(res, 402, { error: '크레딧이 부족합니다.', balance: creditBalance, required: creditCost });
    creditBalance -= creditCost;
    const project = { id: randomUUID(), title: input.title || '새 프로젝트', source: input.source || null, creditCost, status: 'queued', progress: 0, logs: [{ message: '프로젝트 생성 요청을 받았습니다.', at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    projects.set(project.id, project);
    if (input.requestId) creditRequests.set(input.requestId, project);
    persist();
    setTimeout(() => { logProject(project.id, 'AI 분석을 시작했습니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, { ...current, status: 'processing', progress: 35 }); persist(); } }, 250);
    setTimeout(() => { logProject(project.id, '하이라이트와 자막 후보를 분석 중입니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, { ...current, status: 'processing', progress: 72 }); persist(); } }, 600);
    setTimeout(() => { logProject(project.id, '분석이 완료되었습니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, { ...current, status: 'ready', progress: 100 }); persist(); } }, 900);
    return json(res, 201, project);
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  const reprocess = url.pathname.match(/^\/api\/projects\/([^/]+)\/reprocess$/);
  if (req.method === 'GET' && match) return projects.has(match[1]) ? json(res, 200, projects.get(match[1])) : json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
  const logsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/logs$/);
  if (req.method === 'GET' && logsJob) return projects.has(logsJob[1]) ? json(res, 200, { logs: projects.get(logsJob[1]).logs || [] }) : json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
  if (req.method === 'PUT' && match) {
    if (!projects.has(match[1])) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk;
    const update = raw ? JSON.parse(raw) : {};
    const project = { ...projects.get(match[1]), ...update, updatedAt: new Date().toISOString() };
    projects.set(match[1], project); persist(); return json(res, 200, project);
  }
  const refundJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/refund$/);
  if (req.method === 'POST' && refundJob) {
    const project = projects.get(refundJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    if (project.creditRefunded || !project.creditCost) return json(res, 200, { ok: true, balance: creditBalance, refunded: false });
    creditBalance += Number(project.creditCost); logProject(project.id, '처리 실패로 크레딧을 환불했습니다.'); projects.set(project.id, { ...project, creditRefunded: true, status: 'failed' }); persist();
    return json(res, 200, { ok: true, balance: creditBalance, refunded: true });
  }
  if (req.method === 'POST' && reprocess) {
    const id = reprocess[1];
    if (!projects.has(id)) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const project = { ...projects.get(id), status: 'queued', progress: 0, reprocessRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    setTimeout(() => { const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'processing', progress: 45 }); persist(); } }, 250);
    setTimeout(() => { const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'ready', progress: 100 }); persist(); } }, 700);
    return json(res, 202, project);
  }
  const captionsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/captions$/);
  if (req.method === 'POST' && captionsJob) {
    const id = captionsJob[1];
    if (!projects.has(id)) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const project = { ...projects.get(id), jobType: 'captions', status: 'processing', progress: 20, captionsRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    logProject(id, '자막 생성을 시작했습니다.');
    setTimeout(() => { logProject(id, '자막 생성이 완료되었습니다.'); const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'ready', progress: 100, captions: ['자정의 도시는 조용하지만 이 작은 주방은 깨어 있습니다.', '이 국물은 무엇을 해야 하는지 정확히 압니다.', '늦은 밤 한 그릇이면 하루가 정리됩니다.'], captionCues: [{ start: 0, end: 3 }, { start: 3, end: 9 }, { start: 9, end: 16 }] }); persist(); } }, 600);
    return json(res, 202, project);
  }
  const assetsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (req.method === 'POST' && assetsJob) {
    const id = assetsJob[1];
    if (!projects.has(id)) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk;
    const asset = raw ? JSON.parse(raw) : {};
    const project = projects.get(id); const assets = [...(project.assets || []), { ...asset, createdAt: new Date().toISOString() }];
    projects.set(id, { ...project, assets }); persist(); return json(res, 201, assets.at(-1));
  }
  if (req.method === 'DELETE' && assetsJob) {
    const id = assetsJob[1]; if (!projects.has(id)) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk; const input = raw ? JSON.parse(raw) : {};
    const project = projects.get(id); const assets = (project.assets || []).filter(asset => asset.prompt !== input.prompt);
    projects.set(id, { ...project, assets }); persist(); return json(res, 200, { ok: true, assets });
  }
  const exportJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (req.method === 'POST' && exportJob) {
    const id = exportJob[1];
    if (!projects.has(id)) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let exportInput = {}; try { let raw=''; for await (const chunk of req) raw += chunk; exportInput = raw ? JSON.parse(raw) : {}; } catch {} const base = projects.get(id); const project = { ...base, editorState: { ...(base.editorState||{}), ...(exportInput.audio ? {audio: exportInput.audio} : {}), ...(Number.isFinite(exportInput.audioVolume) ? {audioVolume: exportInput.audioVolume} : {}) }, exportStatus: 'queued', exportFormat: 'mp4', exportRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    logProject(id, '렌더링 작업을 대기열에 추가했습니다.');
    if (project.renderInput) {
      const output = join(root, 'renders', `${id}.mp4`);
      const child = spawn(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', ['-y', '-i', project.renderInput, '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
      projects.set(id, { ...project, exportStatus: 'processing', exportOutput: output, exportProgress: 1 }); persist(); logProject(id, 'FFmpeg 렌더링을 시작했습니다.');
      child.stderr.on('data', chunk => { const match = String(chunk).match(/time=(\d+):(\d+):(\d+\.\d+)/); if (!match) return; const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]); const current = projects.get(id); if (current) { projects.set(id, { ...current, exportProgress: Math.min(99, Math.round(seconds / Math.max(1, current.duration || 60) * 100)) }); persist(); } });
      child.on('close', code => { logProject(id, code === 0 ? '렌더링이 완료되었습니다.' : '렌더링에 실패했습니다.'); const current = projects.get(id); if (current) { projects.set(id, { ...current, exportStatus: code === 0 ? 'ready' : 'failed' }); persist(); } });
    }
    return json(res, 202, { id, status: 'queued', manifest: { title: project.title, source: project.source, captions: project.captions || [], captionCues: project.captionCues || [], editorState: project.editorState || {}, visualAsset: project.editorState?.visualAsset || null } });
  }
  if (req.method === 'GET' && exportJob) {
    const project = projects.get(exportJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    if (project.exportStatus !== 'ready' || !project.exportOutput) return json(res, 409, { error: '렌더 결과가 아직 준비되지 않았습니다.', status: project.exportStatus || 'queued' });
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-disposition': `attachment; filename="${project.title || 'skyclip'}.mp4"` });
    return createReadStream(project.exportOutput).pipe(res);
  }
  return json(res, 404, { error: '경로를 찾을 수 없습니다.' });
});

const port = Number(process.env.PORT || 8787);
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`SkyClip 서버가 이미 실행 중입니다: http://localhost:${port}`);
    console.error('기존 서버를 사용하거나 다른 PORT 값을 지정하세요.');
    process.exitCode = 1;
    return;
  }
  console.error('SkyClip 서버 시작 실패:', error);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => console.log(`SkyClip API listening on http://localhost:${port}`));

