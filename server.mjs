import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const projects = new Map();
const creditRequests = new Map();
let creditBalance = 300;
const creditBalances = new Map();
const root = fileURLToPath(new URL('.', import.meta.url));
const maxUploadBytes = 4 * 1024 * 1024 * 1024;
const uploadDir = process.env.SKYCLIP_UPLOAD_DIR || join(root, 'uploads');
const renderDir = process.env.SKYCLIP_RENDER_DIR || join(root, 'renders');
const dataFile = process.env.SKYCLIP_DATA_FILE || join(root, 'skyclip-data.json');
await mkdir(renderDir, { recursive: true });
await mkdir(uploadDir, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
try {
  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  creditBalance = saved.creditBalance ?? 300;
  for (const [workspaceId, balance] of Object.entries(saved.creditBalances || {})) creditBalances.set(workspaceId, Number(balance));
  if (!creditBalances.size) creditBalances.set('demo-workspace', creditBalance);
  for (const project of saved.projects || []) projects.set(project.id, { workspaceId: project.workspaceId || 'demo-workspace', ...project });
} catch (error) {
  console.warn(`[SkyClip] 저장 데이터 로드 실패: ${error?.message || error}. 기본 상태로 시작합니다.`);
}
let persistQueue = Promise.resolve();
const persist = () => { persistQueue = persistQueue.then(async () => { const tempFile = `${dataFile}.tmp`; await writeFile(tempFile, JSON.stringify({ creditBalance, creditBalances: Object.fromEntries(creditBalances), projects: [...projects.values()] }, null, 2), 'utf8'); await rename(tempFile, dataFile); }).catch(() => {}); return persistQueue; };
const logProject = (id, message) => { const project = projects.get(id); if (!project) return; projects.set(id, { ...project, logs: [...(project.logs || []), { message, at: new Date().toISOString() }] }); persist(); };
const buildResultClips = (project) => {
  const sourceLabel = project.source ? '분석 영상' : '새 프로젝트';
  const titles = [`${sourceLabel}의 핵심 장면`, '가장 중요한 반전이 나오는 순간', '짧고 강한 한 문장', '공감을 만드는 설명', '비교로 이해하는 핵심 내용', '마무리 메시지'];
  const reasons = ['강렬한 시작과 명확한 문제 의식이 있어 짧은 영상에서도 메시지가 빠르게 전달됩니다.', '대상과 반전이 분명해 초반 이탈을 줄일 수 있는 클립입니다.', '짧고 독립적인 문장으로 구성돼 빠른 소비에 적합합니다.', '공감과 궁금증을 동시에 만드는 설명형 클립입니다.', '비교 구조가 명확해 정보 전달형 숏폼으로 적합합니다.', '감정적 긴장감이 높아 후킹 제목과 함께 사용하기 좋습니다.'];
  const total = Math.max(6, Number(project.duration) || 283);
  const formatDuration = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, Math.round(seconds % 60))).padStart(2, '0')}`;
  return titles.map((title, index) => { const start = Math.round(index * total / 6); const end = Math.max(start + 1, Math.round((index + 1) * total / 6)); const cueText = (project.captionCues || []).map((cue, cueIndex) => cue.end > start && cue.start < end ? project.captions?.[cueIndex] : '').filter(Boolean).join(' '); return { id: `${project.id}-clip-0${index + 1}`, title, duration: formatDuration(end - start), viralScore: 99 - index, scoreReason: reasons[index], subtitleText: cueText || project.captions?.[index] || '핵심 메시지가 시작부터 선명하게 전달되는 추천 클립입니다.', start, end }; });
};
const sttUrl = process.env.SKYCLIP_STT_URL || '';
const analysisProvider = process.env.SKYCLIP_ANALYSIS_PROVIDER || (sttUrl ? 'external-stt' : 'local');
const sttToken = process.env.SKYCLIP_STT_TOKEN || '';
const sttTimeoutMs = Math.max(5000, Number(process.env.SKYCLIP_STT_TIMEOUT_MS || 120000));
const workspaceSecret = process.env.SKYCLIP_WORKSPACE_SECRET || '';
const buildAnalysisState = (project, stage = 'queued') => ({ provider: analysisProvider, mode: analysisProvider === 'local' ? 'fallback' : 'external', stage, sourceType: project.sourceType || (project.source === 'local-video' ? 'upload' : 'url'), transcriptReady: stage === 'ready', highlightsReady: stage === 'ready' });
const isYoutubeUrl = value => /(?:youtube\.com|youtu\.be)/i.test(String(value || ''));
const isHttpUrl = value => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } };
const probeMedia = file => new Promise(resolve => { const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'ignore'] }); let raw = ''; child.stdout.on('data', chunk => { raw += String(chunk); }); child.on('close', () => { try { const parsed = JSON.parse(raw); const stream = parsed.streams?.find(item => item.width || item.height) || {}; resolve({ duration: Number(parsed.format?.duration) || null, width: Number(stream.width) || null, height: Number(stream.height) || null }); } catch { resolve({ duration: null, width: null, height: null }); } }); child.on('error', () => resolve({ duration: null, width: null, height: null })); });
const exportFormats = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const getExportFormat = value => exportFormats[value] ? value : '9:16';
const parseVtt = raw => raw.split(/\r?\n\r?\n/).map(block => { const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean); const timeIndex = lines.findIndex(line => line.includes('-->')); if (timeIndex < 0) return null; const times = lines[timeIndex].split('-->').map(value => value.trim().split(' ')[0]); const toSeconds = value => { const parts = value.replace(',', '.').split(':').map(Number); return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]; }; const text = lines.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim(); return text ? { start: toSeconds(times[0]), end: toSeconds(times[1]), text } : null; }).filter(Boolean);
const collectYoutubeCaptions = project => new Promise(resolve => { const pattern = join(root, 'uploads', `${project.id}.%(ext)s`); const child = spawn('yt-dlp', ['--no-playlist', '--write-auto-subs', '--sub-langs', 'ko,en', '--sub-format', 'vtt', '--skip-download', '-o', pattern, project.source], { stdio: ['ignore', 'ignore', 'ignore'] }); child.on('close', async () => { for (const language of ['ko', 'en']) { try { const raw = await readFile(join(root, 'uploads', `${project.id}.${language}.vtt`), 'utf8'); const cues = parseVtt(raw); if (cues.length) return resolve({ captions: cues.map(cue => cue.text), captionCues: cues.map(({ start, end }) => ({ start, end })) }); } catch {} } resolve({ captions: [], captionCues: [] }); }); child.on('error', () => resolve({ captions: [], captionCues: [] })); });
const completeAnalysis = project => { const clips = buildResultClips(project); const captions = project.captions?.length ? project.captions : clips.slice(0, 3).map(clip => clip.subtitleText); const captionCues = project.captionCues?.length ? project.captionCues : clips.slice(0, 3).map(clip => ({ start: clip.start, end: clip.end })); return { ...project, status: 'ready', progress: 100, analysis: buildAnalysisState(project, 'ready'), captions, captionCues, resultSet: { sourceVideo: { title: project.title, source: project.source }, clips } }; };
const requestExternalTranscript = async project => { if (!sttUrl || !project.renderInput) return null; try { const buffer = await readFile(project.renderInput); const form = new FormData(); form.append('file', new Blob([buffer], { type: 'video/mp4' }), project.sourceFile || `${project.id}.mp4`); const headers = sttToken ? { authorization: `Bearer ${sttToken}` } : {}; const response = await fetch(sttUrl, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(sttTimeoutMs) }); if (!response.ok) throw new Error(`STT gateway ${response.status}`); const payload = await response.json(); const captions = Array.isArray(payload.captions) ? payload.captions.filter(Boolean).map(String) : []; const captionCues = Array.isArray(payload.captionCues) ? payload.captionCues.map(cue => ({ start: Number(cue.start) || 0, end: Number(cue.end) || 0 })).filter(cue => cue.end > cue.start) : []; return captions.length ? { captions, captionCues } : null; } catch (error) { console.warn(`[SkyClip] 외부 STT 실패, 로컬 폴백으로 전환: ${error?.message || error}`); return null; } };
const completeAnalysisWithProvider = async project => { const transcript = await requestExternalTranscript(project); if (sttUrl && !transcript) logProject(project.id, '외부 STT 응답을 사용하지 못해 로컬 자막 폴백을 적용했습니다.'); if (transcript) logProject(project.id, '외부 STT 자막과 타임코드를 분석에 반영했습니다.'); const current = projects.get(project.id) || {}; return completeAnalysis({ ...current, ...project, ...(transcript || {}), logs: projects.get(project.id)?.logs || project.logs || [] }); };
const startYoutubeDownload = project => {
  const output = join(root, 'uploads', `${project.id}.mp4`);
  const downloading = { ...project, sourceType: 'youtube', status: 'processing', progress: 15, analysis: buildAnalysisState(project, 'downloading') };
  projects.set(project.id, downloading); persist(); logProject(project.id, 'YouTube 원본 다운로드를 시작했습니다.');
  const child = spawn('yt-dlp', ['--no-playlist', '--merge-output-format', 'mp4', '-o', output, project.source], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', chunk => { const current = projects.get(project.id); if (current) { const percent = String(chunk).match(/(\d{1,3}(?:\.\d+)?)%/); projects.set(project.id, { ...current, progress: percent ? Math.max(15, Math.min(72, Math.round(Number(percent[1]) * 0.57 + 15))) : current.progress }); persist(); } });
  child.on('close', async code => { const current = projects.get(project.id); if (!current) return; if (code !== 0) { logProject(project.id, 'YouTube 원본 다운로드에 실패했습니다.'); projects.set(project.id, { ...current, status: 'failed', progress: 0, analysis: buildAnalysisState(current, 'failed') }); persist(); return; } const metadata = await probeMedia(output); const subtitleData = await collectYoutubeCaptions(current); const ready = await completeAnalysisWithProvider({ ...current, ...metadata, ...subtitleData, renderInput: output, sourceType: 'youtube', progress: 85 }); projects.set(project.id, ready); persist(); logProject(project.id, subtitleData.captions.length ? 'YouTube 자막을 가져와 분석에 반영했습니다.' : 'YouTube 원본 다운로드와 분석이 완료되었습니다.'); });
};
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};
const signWorkspace = workspaceId => createHmac('sha256', workspaceSecret).update(workspaceId).digest('hex');
const workspaceIdFromRequest = req => { const cookieValue = String(req.headers.cookie || '').match(/(?:^|;\s*)skyclip_workspace=([^;]+)/)?.[1] || ''; if (workspaceSecret && cookieValue) { const [workspaceId, signature] = decodeURIComponent(cookieValue).split('.'); if (workspaceId && signature && /^[a-f0-9]{64}$/.test(signature)) { const expected = signWorkspace(workspaceId); if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return workspaceId; } return 'unauthenticated-workspace'; } return req.headers['x-workspace-id'] || cookieValue || 'demo-workspace'; };
const visibleProject = (req, id) => { const project = projects.get(id); return project && project.workspaceId === workspaceIdFromRequest(req) ? project : null; };
const workspaceBalance = workspaceId => { if (!creditBalances.has(workspaceId)) creditBalances.set(workspaceId, creditBalance); return creditBalances.get(workspaceId); };

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,x-workspace-id' }); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!requested.includes('..')) {
      try { const body = await readFile(join(root, requested)); res.writeHead(200, { 'content-type': mime[extname(requested)] || 'application/octet-stream' }); return res.end(body); } catch {}
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'skyclip' });
  if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, { analysisProvider, sttConfigured: Boolean(sttUrl), sttAuthenticated: Boolean(sttToken), sttTimeoutMs, youtube: true, ffmpeg: true, persistentStorage: true, storageMode: process.env.SKYCLIP_UPLOAD_DIR || process.env.SKYCLIP_RENDER_DIR ? 'configured-directory' : 'local-directory', authMode: workspaceSecret ? 'signed-workspace' : 'workspace', workspaceAuthConfigured: Boolean(workspaceSecret) });
  if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, { authenticated: false, authMode: 'workspace', workspaceId: workspaceIdFromRequest(req), message: '외부 인증 제공자 연결 전 작업공간 모드로 동작합니다.' });
  if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, { projects: [...projects.values()].filter(project => project.workspaceId === workspaceIdFromRequest(req)) });
  if (req.method === 'GET' && url.pathname === '/api/credits') { const workspaceId = workspaceIdFromRequest(req); return json(res, 200, { balance: workspaceBalance(workspaceId), usage: [...projects.values()].filter(project => project.workspaceId === workspaceId && project.creditCost).map(project => ({ projectId: project.id, title: project.title, cost: project.creditCost, createdAt: project.updatedAt || project.createdAt })) }); }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = raw ? JSON.parse(raw) : {};
    if (input.source && input.source !== 'local-video' && !isHttpUrl(input.source)) return json(res, 400, { error: 'http 또는 https 형식의 영상 링크를 입력해 주세요.' });
    const workspaceId = workspaceIdFromRequest(req);
    const requestKey = input.requestId ? `${workspaceId}:${input.requestId}` : null;
    const persistedRequest = input.requestId ? [...projects.values()].find(project => project.workspaceId === workspaceId && project.requestId === input.requestId) : null;
    if (persistedRequest) return json(res, 200, persistedRequest);
    if (requestKey && creditRequests.has(requestKey)) return json(res, 200, creditRequests.get(requestKey));
    const creditCost = Math.max(0, Number(input.creditCost || 0));
    const balance = workspaceBalance(workspaceId);
    if (creditCost > balance) return json(res, 402, { error: '크레딧이 부족합니다.', balance, required: creditCost });
    creditBalances.set(workspaceId, balance - creditCost);
    const project = { id: randomUUID(), workspaceId, requestId: input.requestId || null, title: input.title || '새 프로젝트', source: input.source || null, sourceType: isYoutubeUrl(input.source) ? 'youtube' : (input.source === 'local-video' ? 'upload' : 'url'), creditCost, status: 'queued', progress: 0, analysis: buildAnalysisState({ source: input.source || null }, 'queued'), logs: [{ message: '프로젝트 생성 요청을 받았습니다.', at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    projects.set(project.id, project);
    if (requestKey) creditRequests.set(requestKey, project);
    persist();
    if (isYoutubeUrl(project.source)) startYoutubeDownload(project);
    else {
      setTimeout(() => { logProject(project.id, 'AI 분석을 시작했습니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, { ...current, status: 'processing', progress: 35, analysis: buildAnalysisState(current, 'transcribing') }); persist(); } }, 250);
      setTimeout(() => { logProject(project.id, '하이라이트와 자막 후보를 분석 중입니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, { ...current, status: 'processing', progress: 72, analysis: buildAnalysisState(current, 'scoring') }); persist(); } }, 600);
      setTimeout(() => { logProject(project.id, '분석이 완료되었습니다.'); const current = projects.get(project.id); if (current) { projects.set(project.id, completeAnalysis(current)); persist(); } }, 900);
    }
    return json(res, 201, project);
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  const sourceJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/source$/);
  if (req.method === 'POST' && sourceJob) {
    const project = visibleProject(req, sourceJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    if (Number(req.headers['content-length']) > maxUploadBytes) return json(res, 413, { error: '업로드 가능한 영상은 최대 4GB입니다.' });
    const extension = (req.headers['x-file-name'] || '').toLowerCase().match(/\.(mp4|mov|webm)$/)?.[1] || 'mp4';
    const output = join(root, 'uploads', `${project.id}.${extension}`);
    let receivedBytes = 0;
    const limiter = new Transform({ transform(chunk, encoding, callback) { receivedBytes += chunk.length; if (receivedBytes > maxUploadBytes) return callback(new Error('UPLOAD_TOO_LARGE')); callback(null, chunk); } });
    try {
      await pipeline(req, limiter, createWriteStream(output));
      const metadata = await probeMedia(output);
      const updated = await completeAnalysisWithProvider({ ...project, ...metadata, source: 'local-video', renderInput: output, sourceFile: req.headers['x-file-name'] || `${project.id}.${extension}`, sourceType: 'upload', progress: 100, updatedAt: new Date().toISOString() });
      projects.set(project.id, updated); persist(); logProject(project.id, '영상 파일 업로드가 완료되었습니다.');
      return json(res, 201, { ok: true, project: updated });
    } catch (error) {
      await unlink(output).catch(() => {});
      return json(res, error?.message === 'UPLOAD_TOO_LARGE' ? 413 : 400, { error: error?.message === 'UPLOAD_TOO_LARGE' ? '업로드 가능한 영상은 최대 4GB입니다.' : `영상 업로드에 실패했습니다: ${error?.message || error}` });
    }
  }
  const sourcePreviewJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/source$/);
  if (req.method === 'GET' && sourcePreviewJob) {
    const project = visibleProject(req, sourcePreviewJob[1]);
    if (!project?.renderInput) return json(res, 404, { error: '원본 영상이 아직 준비되지 않았습니다.' });
    try {
      const fileStats = await stat(project.renderInput);
      const range = String(req.headers.range || '');
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (!match) { res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': fileStats.size }); return createReadStream(project.renderInput).pipe(res); }
      const start = match[1] ? Number(match[1]) : Math.max(0, fileStats.size - Number(match[2] || 1024 * 1024));
      const end = match[2] ? Math.min(fileStats.size - 1, Number(match[2])) : Math.min(fileStats.size - 1, start + 1024 * 1024 - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileStats.size) { res.writeHead(416, { 'content-range': `bytes */${fileStats.size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${fileStats.size}`, 'content-length': end - start + 1 });
      return createReadStream(project.renderInput, { start, end }).pipe(res);
    } catch (error) { return json(res, 404, { error: '원본 영상 파일을 찾을 수 없습니다.' }); }
  }
  const assetFileJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/file$/);
  if (req.method === 'POST' && assetFileJob) {
    const project = visibleProject(req, assetFileJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const extension = (req.headers['x-file-name'] || '').toLowerCase().match(/\.(mp3|wav|m4a|aac|mp4|mov|webm|png|jpg|jpeg|webp)$/)?.[1] || 'bin';
    const output = join(root, 'uploads', `${project.id}-asset-${Date.now()}.${extension}`);
    try { await pipeline(req, createWriteStream(output)); const prompt = req.headers['x-asset-prompt'] || ''; const assets = (project.assets || []).map(asset => asset.prompt === prompt ? { ...asset, filePath: output } : asset); const updated = { ...project, assets }; projects.set(project.id, updated); persist(); return json(res, 201, { ok: true, filePath: output, assets }); } catch (error) { return json(res, 400, { error: `자산 업로드에 실패했습니다: ${error?.message || error}` }); }
  }
  const resultsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/results$/);
  if (req.method === 'GET' && resultsJob) {
    const project = visibleProject(req, resultsJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const resultSet = project.resultSet || { sourceVideo: { title: project.title, source: project.source }, clips: buildResultClips(project) };
    return json(res, 200, { projectId: project.id, status: project.status, resultSet });
  }
  const analysisJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/analysis$/);
  if (req.method === 'GET' && analysisJob) {
    const project = visibleProject(req, analysisJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    return json(res, 200, { projectId: project.id, status: project.status, progress: project.progress, analysis: project.analysis || buildAnalysisState(project, project.status === 'ready' ? 'ready' : project.status) });
  }
  const reprocess = url.pathname.match(/^\/api\/projects\/([^/]+)\/reprocess$/);
  if (req.method === 'GET' && match) { const project = visibleProject(req, match[1]); return project ? json(res, 200, project) : json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' }); }
  const logsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/logs$/);
  if (req.method === 'GET' && logsJob) { const project = visibleProject(req, logsJob[1]); return project ? json(res, 200, { logs: project.logs || [] }) : json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' }); }
  if (req.method === 'PUT' && match) {
    if (!visibleProject(req, match[1])) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk;
    const update = raw ? JSON.parse(raw) : {};
    const project = { ...projects.get(match[1]), ...update, workspaceId: workspaceIdFromRequest(req), updatedAt: new Date().toISOString() };
    projects.set(match[1], project); persist(); return json(res, 200, project);
  }
  const refundJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/refund$/);
  if (req.method === 'POST' && refundJob) {
    const project = visibleProject(req, refundJob[1]);
    if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    if (project.creditRefunded || !project.creditCost) return json(res, 200, { ok: true, balance: creditBalance, refunded: false });
    const workspaceId = workspaceIdFromRequest(req); const refundedBalance = workspaceBalance(workspaceId) + Number(project.creditCost); creditBalances.set(workspaceId, refundedBalance); logProject(project.id, '처리 실패로 크레딧을 환불했습니다.'); projects.set(project.id, { ...project, creditRefunded: true, status: 'failed' }); persist();
    return json(res, 200, { ok: true, balance: refundedBalance, refunded: true });
  }
  if (req.method === 'POST' && reprocess) {
    const id = reprocess[1];
    const visible = visibleProject(req, id);
    if (!visible) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const project = { ...visible, status: 'queued', progress: 0, reprocessRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    setTimeout(() => { const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'processing', progress: 45 }); persist(); } }, 250);
    setTimeout(() => { const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'ready', progress: 100 }); persist(); } }, 700);
    return json(res, 202, project);
  }
  const captionsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/captions$/);
  if (req.method === 'POST' && captionsJob) {
    const id = captionsJob[1];
    const visible = visibleProject(req, id);
    if (!visible) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    const project = { ...visible, jobType: 'captions', status: 'processing', progress: 20, captionsRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    logProject(id, '자막 생성을 시작했습니다.');
    setTimeout(() => { logProject(id, '자막 생성이 완료되었습니다.'); const current = projects.get(id); if (current) { projects.set(id, { ...current, status: 'ready', progress: 100, captions: ['자정의 도시는 조용하지만 이 작은 주방은 깨어 있습니다.', '이 국물은 무엇을 해야 하는지 정확히 압니다.', '늦은 밤 한 그릇이면 하루가 정리됩니다.'], captionCues: [{ start: 0, end: 3 }, { start: 3, end: 9 }, { start: 9, end: 16 }] }); persist(); } }, 600);
    return json(res, 202, project);
  }
  const assetsJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (req.method === 'POST' && assetsJob) {
    const id = assetsJob[1];
    const visible = visibleProject(req, id);
    if (!visible) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk;
    const asset = raw ? JSON.parse(raw) : {};
    const project = visible; const assets = [...(project.assets || []), { ...asset, createdAt: new Date().toISOString() }];
    projects.set(id, { ...project, assets }); persist(); return json(res, 201, assets.at(-1));
  }
  if (req.method === 'DELETE' && assetsJob) {
    const id = assetsJob[1]; const project = visibleProject(req, id); if (!project) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let raw = ''; for await (const chunk of req) raw += chunk; const input = raw ? JSON.parse(raw) : {};
    const assets = (project.assets || []).filter(asset => asset.prompt !== input.prompt);
    projects.set(id, { ...project, assets }); persist(); return json(res, 200, { ok: true, assets });
  }
  const exportJob = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (req.method === 'POST' && exportJob) {
    const id = exportJob[1];
    const base = visibleProject(req, id);
    if (!base) return json(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    let exportInput = {}; try { let raw=''; for await (const chunk of req) raw += chunk; exportInput = raw ? JSON.parse(raw) : {}; } catch {} const clipStart = Number.isFinite(exportInput.clipStart) ? Math.max(0, exportInput.clipStart) : Number(base.editorState?.clipStart); const clipEnd = Number.isFinite(exportInput.clipEnd) ? Math.max(clipStart + 0.1, exportInput.clipEnd) : Number(base.editorState?.clipEnd); const editorRange = Number.isFinite(clipStart) && Number.isFinite(clipEnd) ? { clipStart, clipEnd } : {}; const format = getExportFormat(exportInput.format || base.editorState?.format); const project = { ...base, editorState: { ...(base.editorState||{}), ...editorRange, format, ...(exportInput.assetTimeline ? {assetTimeline: exportInput.assetTimeline} : {}), ...(exportInput.audio ? {audio: exportInput.audio} : {}), ...(Number.isFinite(exportInput.audioVolume) ? {audioVolume: exportInput.audioVolume} : {}) }, exportStatus: 'queued', exportFormat: 'mp4', exportRequestedAt: new Date().toISOString() };
    projects.set(id, project); persist();
    logProject(id, '렌더링 작업을 대기열에 추가했습니다.');
    if (project.renderInput) {
      const output = join(root, 'renders', `${id}.mp4`);
      const trimArgs = Number.isFinite(project.editorState?.clipStart) && Number.isFinite(project.editorState?.clipEnd) ? ['-ss', String(project.editorState.clipStart), '-to', String(project.editorState.clipEnd)] : [];
      const audioAssetPath = project.editorState?.audioFile ? project.assets?.find(asset => asset.fileName === project.editorState.audioFile)?.filePath : null;
      const visualAsset = project.editorState?.visualAsset;
      const visualAssetRecord = visualAsset?.fileName ? project.assets?.find(asset => asset.fileName === visualAsset.fileName) : null;
      const visualAssetPath = visualAssetRecord?.filePath || null;
      const inputArgs = ['-i', project.renderInput];
      const [width, height] = exportFormats[format];
      let filterArgs = ['-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`];
      let videoMapArgs = [];
      let audioMapArgs = ['-c:a', 'aac'];
      if (visualAssetPath) { inputArgs.push(...(visualAsset.type?.includes('이미지') ? ['-loop', '1', '-i', visualAssetPath] : ['-stream_loop', '-1', '-i', visualAssetPath])); const assetWidth = Math.round(width * 0.833); filterArgs = ['-filter_complex', `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[base];[1:v]scale=${assetWidth}:-2[asset];[base][asset]overlay=(W-w)/2:(H-h)/2:enable=\'between(t,0,99999)\'[v]`]; videoMapArgs = ['-map', '[v]']; }
      if (audioAssetPath) { const audioIndex = visualAssetPath ? '2' : '1'; inputArgs.push('-i', audioAssetPath); audioMapArgs = ['-map', `${audioIndex}:a:0`, '-shortest']; }
      const child = spawn(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', ['-y', ...trimArgs, ...inputArgs, ...filterArgs, ...videoMapArgs, ...(audioAssetPath ? audioMapArgs : ['-map', '0:a?','-c:a', 'aac']), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
      projects.set(id, { ...project, exportStatus: 'processing', exportOutput: output, exportProgress: 1 }); persist(); logProject(id, 'FFmpeg 렌더링을 시작했습니다.');
      child.stderr.on('data', chunk => { const match = String(chunk).match(/time=(\d+):(\d+):(\d+\.\d+)/); if (!match) return; const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]); const current = projects.get(id); if (current) { projects.set(id, { ...current, exportProgress: Math.min(99, Math.round(seconds / Math.max(1, current.duration || 60) * 100)) }); persist(); } });
      child.on('close', async code => { if(code!==0) await unlink(output).catch(()=>{}); logProject(id, code === 0 ? '렌더링이 완료되었습니다.' : '렌더링에 실패했습니다.'); const current = projects.get(id); if (current) { projects.set(id, { ...current, exportStatus: code === 0 ? 'ready' : 'failed' }); persist(); } });
    }
    return json(res, 202, { id, status: 'queued', manifest: { title: project.title, source: project.source, captions: project.captions || [], captionCues: project.captionCues || [], editorState: project.editorState || {}, visualAsset: project.editorState?.visualAsset || null } });
  }
  if (req.method === 'GET' && exportJob) {
    const project = visibleProject(req, exportJob[1]);
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
const shutdown = signal => { console.log(`[SkyClip] ${signal} 수신, 서버를 안전하게 종료합니다.`); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
server.listen(port, '0.0.0.0', () => console.log(`SkyClip API listening on http://localhost:${port}`));

