import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { basename, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const dataRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.skyclip-data');
const uploadRoot = join(dataRoot, 'uploads');
const requestedPort = Number(process.env.PORT || 8787);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const execFile = promisify((file, args, options, callback) => {
  const child = spawn(file, args, options);
  let stdout = ''; let stderr = '';
  let finished = false;
  const finish = (error, result) => { if (finished) return; finished = true; clearTimeout(timer); callback(error, result); };
  const timer = options?.timeoutMs ? setTimeout(() => { child.kill(); finish(new Error(`Command timed out: ${file}`)); }, options.timeoutMs) : null;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => finish(error));
  child.on('close', code => code === 0 ? finish(null, { stdout, stderr }) : finish(Object.assign(new Error(stderr || `Command failed: ${file}`), { code, stdout, stderr })));
});

await mkdir(uploadRoot, { recursive: true });

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readBody(req, limit = 1024 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('파일이 너무 큽니다. 최대 1GB까지 지원합니다.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

async function probe(filePath) {
  try {
    const result = await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,codec_name', '-of', 'json', filePath], { windowsHide: true });
    const parsed = JSON.parse(result.stdout);
    const video = parsed.streams?.find(stream => stream.width || stream.height) || {};
    return { duration: Number(parsed.format?.duration || 0), size: Number(parsed.format?.size || 0), width: video.width || null, height: video.height || null, codec: video.codec_name || null };
  } catch (error) {
    return { duration: 0, size: 0, width: null, height: null, codec: null, probeError: error.message };
  }
}

async function extractPreview(sourcePath, projectId) {
  const output = join(uploadRoot, `${projectId}-clip.mp4`);
  try {
    await execFile('ffmpeg', ['-y', '-ss', '0', '-i', sourcePath, '-t', '15', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', output], { windowsHide: true });
    return output;
  } catch { return null; }
}

async function detectSceneStarts(sourcePath, total, window) {
  try {
    const result = await execFile('ffmpeg', ['-hide_banner', '-i', sourcePath, '-vf', "select='gt(scene,0.35)',showinfo", '-an', '-f', 'null', '-'], { windowsHide: true, timeoutMs: 300000 });
    const starts = [...result.stderr.matchAll(/pts_time:([0-9.]+)/g)].map(match => Number(match[1])).filter(value => Number.isFinite(value) && value >= 0 && value <= Math.max(0, total - window));
    return [...new Set(starts.map(value => Number(value.toFixed(2))))];
  } catch { return []; }
}

async function makeReadyClip(clipPath, projectId, index, duration) {
  const vttPath = join(uploadRoot, `${projectId}-clip-${index}.vtt`); const readyPath = join(uploadRoot, `${projectId}-ready-${index}.mp4`); let captions = [];
  try { const result = await execFile('python', [join(fileURLToPath(new URL('.', import.meta.url)), 'scripts', 'stt.py'), clipPath, vttPath], { windowsHide: true, timeoutMs: 300000 }); const output = JSON.parse(result.stdout.trim()); captions = output.captions || []; } catch {}
  const crop = 'crop=ih*9/16:ih:(iw-ow)/2:0,scale=720:1280'; const captionFile = vttPath.replaceAll('\\', '/').replaceAll(':', '\\:'); const filters = [crop];
  if (captions.length) filters.push(`subtitles=filename='${captionFile}':force_style='FontSize=28,PrimaryColour=&H00FFFFFF,Alignment=2,Outline=2,MarginV=70'`);
  await execFile('ffmpeg', ['-y', '-i', clipPath, '-vf', filters.join(','), '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', readyPath], { windowsHide: true, timeoutMs: 180000 });
  return { path: readyPath, captions };
}

function buildHighlightSignals(captions, duration, selectionMeta = {}) {
  const text = captions.map(item => String(item.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const words = text.split(/\s+/).filter(Boolean); const normalizedWords = words.map(word => word.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean); const uniqueWords = new Set(normalizedWords).size;
  const lexicalDiversity = words.length ? Math.min(1, uniqueWords / words.length) : 0;
  const captionCoverage = captions.length ? Math.min(1, captions.reduce((sum, item) => sum + Math.max(0, Number(item.end) - Number(item.start)), 0) / Math.max(0.5, duration)) : 0;
  const sceneScore = selectionMeta.sceneAligned ? 1 : 0.35;
  const reactionScore = Math.min(1, (text.match(/[!?！？]|(와|진짜|대박|미쳤|감동|웃|놀랍|소름|헐)/g) || []).length / 3);
  const meaningCueCount = (text.match(/(왜|어떻게|결국|그래서|하지만|오늘|지금|처음|마지막|방법|이유|핵심|결론|추천|주의|성공|실패|배운|느꼈|입니다|합니다|했어요|해요|하세요|보세요|가자)/g) || []).length;
  const completedSentence = /[.!?。！？]|(다|요|죠|니다|세요)(\s|$)/.test(text) ? 1 : 0;
  const semanticSignal = Math.min(1, meaningCueCount / 3 * 0.55 + completedSentence * 0.25 + lexicalDiversity * 0.2);
  const noisePenalty = normalizedWords.length >= 4 ? Math.min(1, (text.match(/(.)\1{2,}|[,]{3,}|[0-9]{3,}/g) || []).length / 2) : 0;
  return { lexicalDiversity: Number(lexicalDiversity.toFixed(3)), captionCoverage: Number(captionCoverage.toFixed(3)), sceneScore, reactionScore, semanticSignal: Number(semanticSignal.toFixed(3)), noisePenalty: Number(noisePenalty.toFixed(3)), selectionReason: selectionMeta.sceneAligned ? '장면 변화·음성 반응·의미 단서가 함께 감지된 구간' : '음성·자막·의미 단서·길이 지표가 안정적인 구간' };
}

function buildClipTitle(captions, index) {
  const rows = captions.map(item => String(item.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!rows.length) return `핵심 장면 ${index}`;
  const ranked = rows.map((row, rowIndex) => { const words = row.split(/\s+/).filter(Boolean); const hook = (row.match(/(왜|어떻게|진짜|대박|미쳤|결국|핵심|방법|이유|처음|마지막|주의|성공|실패|추천|놀랍|충격|반전|비밀)/g) || []).length; const completion = /[.!?。！？]|(다|요|죠|니다|세요)$/.test(row) ? 1 : 0; const lengthFit = 1 - Math.min(1, Math.abs(words.length - 7) / 12); return { row, score: hook * 2.4 + completion + lengthFit + (rowIndex === 0 ? 0.35 : 0) }; }).sort((left, right) => right.score - left.score);
  const cleaned = ranked[0].row.replace(/^(그래서|근데|그리고|어|음|저|이제)\s+/u, '').replace(/[.!?。！？]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean).filter(word => /[\p{L}\p{N}]/u.test(word) && word.replace(/[^\p{L}\p{N}]/gu, '').length >= 2).filter((word, wordIndex, all) => { if (wordIndex === 0) return true; const normalize = value => value.replace(/[.,!?。！？,，]+$/g, ''); return normalize(word) !== normalize(all[wordIndex - 1]); }); const candidate = words.slice(0, 8).join(' ');
  return `${candidate.slice(0, 32)}${candidate.length > 32 ? '…' : ''}`;
}

function correctCaptionSet(captions) {
  const corrected = []; let previous = '';
  for (const item of Array.isArray(captions) ? captions : []) {
    const words = Array.isArray(item.words) ? item.words.map(word => ({ ...word, text: String(word.text || '').replace(/\s+/g, ' ').trim() })).filter(word => word.text) : [];
    const text = String(words.length ? words.map(word => word.text).join(' ') : item.text || '').replace(/([,.!?！？])\1+/g, '$1').replace(/\s+/g, ' ').trim();
    if (!text || text === previous) continue;
    const start = Math.max(0, Number(item.start) || 0); const end = Math.max(start + 0.05, Number(item.end) || start + 0.2);
    corrected.push({ ...item, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), text, words }); previous = text;
  }
  for (let index = 1; index < corrected.length; index += 1) if (corrected[index].start < corrected[index - 1].end) corrected[index - 1].end = corrected[index].start;
  return corrected.filter(item => item.end > item.start);
}

async function extractClip(sourcePath, projectId, index, start, end, selectionMeta = {}) {
  const clipPath = join(uploadRoot, `${projectId}-clip-${index}.mp4`); const thumbPath = join(uploadRoot, `${projectId}-clip-${index}.jpg`);
  const duration = Math.max(0.5, end - start);
  await execFile('ffmpeg', ['-y', '-ss', String(start), '-i', sourcePath, '-t', String(duration), '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', clipPath], { windowsHide: true, timeoutMs: 180000 });
  let ready;
  try { ready = await makeReadyClip(clipPath, projectId, index, duration); }
  catch { ready = { path: clipPath, captions: [], fallback: true }; }
  await execFile('ffmpeg', ['-y', '-i', ready.path, '-frames:v', '1', '-q:v', '3', thumbPath], { windowsHide: true, timeoutMs: 60000 });
  const audio = await measureAudio(clipPath, duration);
  const durationFit = Math.max(0, Math.min(1, 1 - Math.abs(duration - 22) / 22)); const signals = buildHighlightSignals(ready.captions || [], duration, selectionMeta); const speech = audio.speechCoverage == null ? 0 : audio.speechCoverage;
  const scoreValue = speech * 0.25 + durationFit * 0.14 + signals.sceneScore * 0.18 + signals.captionCoverage * 0.14 + signals.lexicalDiversity * 0.08 + signals.reactionScore * 0.09 + signals.semanticSignal * 0.12 - signals.noisePenalty * 0.06;
  const scoreBreakdown = { speechCoverage: audio.speechCoverage, silenceEvents: audio.silenceEvents, durationFit: Number(durationFit.toFixed(3)), hook: Math.round((speech * 0.4 + signals.reactionScore * 0.22 + signals.sceneScore * 0.2 + signals.semanticSignal * 0.18) * 100), topic: Math.round((signals.captionCoverage * 0.42 + signals.lexicalDiversity * 0.28 + signals.semanticSignal * 0.3) * 100), flow: Math.round((1 - Math.min(1, (audio.silenceEvents || 0) / 8)) * 100), immersion: Math.round((speech * 0.42 + signals.sceneScore * 0.22 + signals.reactionScore * 0.18 + signals.semanticSignal * 0.18) * 100), ending: Math.round((durationFit * 0.45 + signals.captionCoverage * 0.3 + signals.semanticSignal * 0.25) * 100), evidence: ['실제 오디오 무음 구간', 'FFmpeg 장면 변화 후보', '자막 커버리지·어휘 다양성', '문장 완결·핵심 단서·어휘 다양성', signals.reactionScore > 0 ? '음성 반응 표현' : '음성 반응 표현 미검출'], signals };
  const score = audio.score == null ? null : Math.round(scoreValue * 100);
  const title = buildClipTitle(ready.captions || [], index);
  return { id: `${projectId}-${index}`, start, end, duration, title, score, scoreType: '음성·장면·의미·자막 결합 휴리스틱', metrics: { ...audio, ...signals }, scoreBreakdown, captions: ready.captions, ready: !ready.fallback, aspectRatio: ready.fallback ? 'source' : '9:16', previewUrl: `/media/${basename(ready.path)}`, sourcePreviewUrl: `/media/${basename(clipPath)}`, thumbnailUrl: `/media/${basename(thumbPath)}` };
}

async function renderSegments(sourcePath, projectId, segments, transitions = []) {
  const files = []; const durations = [];
  const fadeTransition = transitions.find(item => item?.type === 'fade'); const fadeDuration = Math.max(0.1, Math.min(1, Number(fadeTransition?.duration) || 0.25));
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]; const start = Math.max(0, Number(segment.start) || 0); const duration = Math.max(0.1, (Number(segment.end) || start + 0.1) - start); const output = join(uploadRoot, `${projectId}-segment-${index + 1}.mp4`); durations.push(duration);
    const args = ['-y', '-ss', String(start), '-i', sourcePath, '-t', String(duration)]; if (fadeTransition) { const videoFilters = []; const audioFilters = []; if (index > 0) { videoFilters.push(`fade=t=in:st=0:d=${fadeDuration}`); audioFilters.push(`afade=t=in:st=0:d=${fadeDuration}`); } if (index < segments.length - 1 && duration > fadeDuration) { videoFilters.push(`fade=t=out:st=${Math.max(0, duration - fadeDuration)}:d=${fadeDuration}`); audioFilters.push(`afade=t=out:st=${Math.max(0, duration - fadeDuration)}:d=${fadeDuration}`); } if (videoFilters.length) args.push('-vf', videoFilters.join(',')); if (audioFilters.length) args.push('-af', audioFilters.join(',')); } args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', output); await execFile('ffmpeg', args, { windowsHide: true, timeoutMs: 180000 }); files.push(output);
  }
  const combined = join(uploadRoot, `${projectId}-segments.mp4`);
  if (fadeTransition && files.length > 1) {
    const args = ['-y']; for (const file of files) args.push('-i', file);
    let video = '[0:v]'; let audio = '[0:a]'; let elapsed = durations[0]; const filters = [];
    for (let index = 1; index < files.length; index += 1) { const nextVideo = `[v${index}]`; const nextAudio = `[a${index}]`; const overlap = Math.min(fadeDuration, Math.max(0.05, durations[index - 1] / 2), Math.max(0.05, durations[index] / 2)); filters.push(`${video}[${index}:v]xfade=transition=fade:duration=${overlap}:offset=${Math.max(0, elapsed - overlap)}${nextVideo}`); filters.push(`${audio}[${index}:a]acrossfade=d=${overlap}${nextAudio}`); video = nextVideo; audio = nextAudio; elapsed += durations[index] - overlap; }
    args.push('-filter_complex', filters.join(';'), '-map', video, '-map', audio, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', combined);
    await execFile('ffmpeg', args, { windowsHide: true, timeoutMs: 180000 }); return combined;
  }
  const listPath = join(uploadRoot, `${projectId}-segments.txt`); await writeFile(listPath, files.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'), 'utf8');
  await execFile('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', combined], { windowsHide: true, timeoutMs: 180000 }); return combined;
}

async function measureAudio(filePath, duration) {
  try {
    const result = await execFile('ffmpeg', ['-hide_banner', '-i', filePath, '-af', 'silencedetect=noise=-35dB:d=0.45', '-f', 'null', '-'], { windowsHide: true, timeoutMs: 60000 });
    const silenceStarts = (result.stderr.match(/silence_start:/g) || []).length;
    const silenceEnds = (result.stderr.match(/silence_end:/g) || []).length;
    const silenceEvents = Math.max(silenceStarts, silenceEnds);
    const silenceRatio = Math.min(1, silenceEvents * 0.12);
    const speechCoverage = Math.max(0, 1 - silenceRatio);
    return { hasAudio: true, speechCoverage: Number(speechCoverage.toFixed(3)), silenceEvents, score: Math.round(50 + speechCoverage * 50) };
  } catch {
    return { hasAudio: false, speechCoverage: null, silenceEvents: null, score: null };
  }
}

async function downloadYouTube(url, outputPath) {
  await execFile('yt-dlp.exe', ['--no-playlist', '--socket-timeout', '20', '--retries', '1', '--fragment-retries', '1', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4', '-o', outputPath, url], { windowsHide: true, timeoutMs: 120000 });
  return outputPath;
}

async function prepareYouTubeProject(project, sourcePath) {
  const projectPath = join(dataRoot, `${project.id}.json`);
  try {
    await downloadYouTube(project.source, sourcePath);
    project.sourceType = 'file'; project.source = sourcePath; project.fileName = 'youtube-video.mp4'; project.status = 'ready'; project.progress = 55; project.metadata = await probe(sourcePath);
  } catch (error) { project.status = 'failed'; project.progress = 0; project.error = error.message || '링크 영상 다운로드 시간이 초과되었습니다.'; }
  project.updatedAt = new Date().toISOString();
  await writeFile(projectPath, JSON.stringify(project, null, 2));
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') { json(res, 200, { ok: true, service: 'skyclip', mode: 'local' }); return true; }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const entries = await (await import('node:fs/promises')).readdir(dataRoot, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) if (entry.isFile() && /^[0-9a-f-]{36}\.json$/i.test(entry.name)) { try { const project = JSON.parse(await readFile(join(dataRoot, entry.name), 'utf8')); if (project.id && project.sourceType) projects.push(project); } catch {} }
    projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); json(res, 200, { projects }); return true;
  }
  const projectGet = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectGet) { const projectPath = join(dataRoot, `${projectGet[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const started = Date.parse(project.downloadStartedAt || ''); const updated = Date.parse(project.updatedAt || project.createdAt || ''); let changed = false; for (const [index, clip] of (project.clips || []).entries()) if ((clip.scoreType === '음성·장면·자막 결합 휴리스틱' || clip.scoreType === '음성·장면·의미·자막 결합 휴리스틱') && clip.captions?.length) { const title = buildClipTitle(clip.captions, index + 1); if (title !== clip.title) { clip.title = title; changed = true; } } if (project.status === 'downloading' && Number.isFinite(started) && Date.now() - started > 60000) { project.status = 'failed'; project.progress = 0; project.error = '링크 영상 다운로드가 60초 이상 진행되지 않아 중단되었습니다. 다시 시도해 주세요.'; project.updatedAt = new Date().toISOString(); changed = true; } else if (project.status === 'analyzing' && project.clips?.length && Number.isFinite(updated) && Date.now() - updated > 120000) { project.status = 'completed'; project.progress = 100; project.analysisRecovery = 'stale-analysis-recovered'; project.updatedAt = new Date().toISOString(); changed = true; } if (changed) await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, project); return true; }
  if (req.method === 'GET' && url.pathname === '/api/templates') {
    const file = join(dataRoot, 'templates.json'); try { json(res, 200, { templates: JSON.parse(await readFile(file, 'utf8')) }); } catch { json(res, 200, { templates: [] }); } return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/templates') {
    const file = join(dataRoot, 'templates.json'); let templates = []; try { templates = JSON.parse(await readFile(file, 'utf8')); } catch {}
    const payload = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8')); const template = { id: randomUUID(), name: String(payload.name || '새 템플릿'), aspectRatio: payload.aspectRatio || '9:16', captionStyle: payload.captionStyle || {}, createdAt: new Date().toISOString() };
    templates.push(template); await writeFile(file, JSON.stringify(templates, null, 2)); json(res, 201, template); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/assets') {
    const id = randomUUID(); const name = String(req.headers['x-file-name'] || 'asset.bin').replace(/[^a-zA-Z0-9._-]/g, '_'); const assetPath = join(uploadRoot, `${id}-${name}`); await writeFile(assetPath, await readBody(req)); const asset = { id, name, kind: String(req.headers['x-asset-kind'] || 'file'), path: assetPath, url: `/media/${basename(assetPath)}`, createdAt: new Date().toISOString() }; await writeFile(join(dataRoot, `asset-${id}.json`), JSON.stringify(asset, null, 2)); json(res, 201, asset); return true;
  }
  const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
  if (req.method === 'DELETE' && assetMatch) {
    const assetFile = join(dataRoot, `asset-${assetMatch[1]}.json`); let asset; try { asset = JSON.parse(await readFile(assetFile, 'utf8')); } catch { json(res, 404, { ok: false, error: '에셋을 찾을 수 없습니다.' }); return true; }
    try { await unlink(asset.path); } catch {} await unlink(assetFile); json(res, 200, { ok: true, id: asset.id }); return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/assets') {
    const entries = await (await import('node:fs/promises')).readdir(dataRoot, { withFileTypes: true }); const assets = [];
    for (const entry of entries) if (entry.isFile() && entry.name.startsWith('asset-') && entry.name.endsWith('.json')) { try { assets.push(JSON.parse(await readFile(join(dataRoot, entry.name), 'utf8'))); } catch {} }
    json(res, 200, { assets }); return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const projectId = randomUUID(); const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'));
      const sourceUrl = String(payload.url || '').trim();
      const existingEntries = await (await import('node:fs/promises')).readdir(dataRoot, { withFileTypes: true });
      for (const entry of existingEntries) if (entry.isFile() && entry.name.endsWith('.json')) { try { const existing = JSON.parse(await readFile(join(dataRoot, entry.name), 'utf8')); if (existing.status === 'downloading' && existing.source === sourceUrl) { json(res, 202, existing); return true; } } catch {} }
      let project = { id: projectId, sourceType: 'url', source: sourceUrl, fileName: null, status: 'needs-source', progress: 0, metadata: null, createdAt: new Date().toISOString() };
      if (/^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(sourceUrl)) {
        const sourcePath = join(uploadRoot, `${projectId}-youtube.mp4`); project.status = 'downloading'; project.progress = 5; project.downloadStartedAt = new Date().toISOString(); await writeFile(join(dataRoot, `${projectId}.json`), JSON.stringify(project, null, 2)); void prepareYouTubeProject(project, sourcePath); json(res, 202, project); return true;
      } else if (/^https?:\/\/.*\.(mp4|mov|webm)(\?.*)?$/i.test(sourceUrl)) {
        const remote = await fetch(sourceUrl); if (!remote.ok) throw new Error(`영상 링크를 가져오지 못했습니다. (${remote.status})`);
        const remoteBody = Buffer.from(await remote.arrayBuffer()); if (remoteBody.length > 1024 * 1024 * 1024) throw new Error('원격 영상이 1GB를 초과합니다.');
        const fileName = basename(new URL(sourceUrl).pathname) || 'remote-video.mp4'; const sourcePath = join(uploadRoot, `${projectId}-${fileName}`); await writeFile(sourcePath, remoteBody);
        project = { ...project, sourceType: 'file', source: sourcePath, fileName, status: 'ready', metadata: await probe(sourcePath) };
      }
      await writeFile(join(dataRoot, `${projectId}.json`), JSON.stringify(project, null, 2)); json(res, 201, project); return true;
    }
    const fileName = String(req.headers['x-file-name'] || 'source-video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const sourcePath = join(uploadRoot, `${projectId}-${fileName}`); const body = await readBody(req);
    await writeFile(sourcePath, body); const metadata = await probe(sourcePath);
    const project = { id: projectId, sourceType: 'file', source: sourcePath, fileName, status: 'ready', progress: 0, metadata, createdAt: new Date().toISOString() };
    await writeFile(join(dataRoot, `${projectId}.json`), JSON.stringify(project, null, 2)); json(res, 201, project); return true;
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/(analyze|preview)$/);
  if (req.method === 'POST' && match) {
    const projectPath = join(dataRoot, `${match[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    if (project.sourceType === 'url') { project.status = 'needs-downloader'; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 422, { ok: false, error: '이 링크는 직접 영상 파일이 아닙니다. MP4 링크 또는 파일 업로드를 사용하세요.', project }); return true; }
    if (match[2] === 'preview' && project.sourceType === 'file') { const previewPath = await extractPreview(project.source, project.id); json(res, 200, { ok: Boolean(previewPath), previewPath }); return true; }
    project.status = 'analyzing'; project.progress = 18; await writeFile(projectPath, JSON.stringify(project, null, 2));
    if (project.sourceType === 'file') { project.previewPath = await extractPreview(project.source, project.id); project.previewUrl = project.previewPath ? `/media/${basename(project.previewPath)}` : null; }
    const total = Number(project.metadata?.duration || 15);
    const window = Math.min(22, total);
    const sceneStarts = await detectSceneStarts(project.source, total, window);
    const fallbackStarts = [0, total * 0.2, total * 0.4, total * 0.6, total * 0.8].map(value => Math.max(0, Math.min(Math.max(0, total - window), value)));
    const starts = [...new Set([...sceneStarts.slice(0, 5), ...fallbackStarts].map(value => Number(value.toFixed(2))))].sort((a, b) => a - b).slice(0, 5);
    project.analysisEvidence = { selector: sceneStarts.length ? 'ffmpeg-scene-change-plus-uniform-fallback' : 'uniform-fallback', sceneCandidates: sceneStarts.length, windowSeconds: window };
    project.clips = [];
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      if (window > 0.5) project.clips.push(await extractClip(project.source, project.id, index + 1, start, Math.min(total, start + window), { sceneAligned: sceneStarts.some(candidate => Math.abs(candidate - start) < 0.05) }));
      project.progress = Math.min(92, 25 + Math.round(((index + 1) / starts.length) * 67)); project.updatedAt = new Date().toISOString(); await writeFile(projectPath, JSON.stringify(project, null, 2));
    }
    if (project.clips[0]) { project.previewUrl = project.clips[0].previewUrl; project.previewPath = join(uploadRoot, basename(project.clips[0].previewUrl)); project.captions = project.clips[0].captions || []; }
    project.status = 'completed'; project.progress = 100;
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, project); return true;
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  const selectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/select$/);
  if (req.method === 'POST' && selectMatch) {
    const projectPath = join(dataRoot, `${selectMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const payload = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8')); const clip = (project.clips || []).find(item => item.id === payload.clipId);
    if (!clip) { json(res, 404, { ok: false, error: '선택한 클립을 찾을 수 없습니다.' }); return true; }
    project.previewUrl = clip.previewUrl; project.previewPath = join(uploadRoot, basename(clip.previewUrl)); project.captions = clip.captions || project.captions || []; project.title = clip.title || project.title; project.selectedClipId = clip.id; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, selectedClipId: clip.id, previewUrl: project.previewUrl, captions: project.captions }); return true;
  }
  const feedbackMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/clip-feedback$/);
  if (req.method === 'POST' && feedbackMatch) {
    const projectPath = join(dataRoot, `${feedbackMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    const payload = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8')); const clip = (project.clips || []).find(item => item.id === payload.clipId);
    if (!clip) { json(res, 404, { ok: false, error: '선택한 클립을 찾을 수 없습니다.' }); return true; }
    const feedback = ['favorite', 'like', 'dislike'].includes(payload.type) ? payload.type : null;
    clip.feedback = feedback; project.selectedClipId = clip.id; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, clipId: clip.id, feedback }); return true;
  }
  const toolMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tools\/([^/]+)$/);
  if (req.method === 'POST' && toolMatch && toolMatch[2] === 'silence') {
    const projectPath = join(dataRoot, `${toolMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const source = project.previewPath || project.source; const output = join(uploadRoot, `${project.id}-silence.mp4`);
    await execFile('ffmpeg', ['-y', '-i', source, '-af', 'silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-35dB', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', output], { windowsHide: true, timeoutMs: 180000 });
    project.previewPath = output; project.previewUrl = `/media/${basename(output)}`; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, previewUrl: project.previewUrl }); return true;
  }
  if (req.method === 'POST' && exportMatch) {
    const projectPath = join(dataRoot, `${exportMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    project.exportStatus = 'rendering'; project.exportProgress = 5; project.exportError = null; await writeFile(projectPath, JSON.stringify(project, null, 2));
    let exportOptions = {}; try { const body = await readBody(req, 1024 * 1024); if (body.length) exportOptions = JSON.parse(body.toString('utf8')); } catch {}
    let source = project.previewPath || project.source; if (!source) throw new Error('내보낼 영상이 없습니다.');
    const segments = Array.isArray(project.edit?.segments) ? project.edit.segments.filter(item => Number(item.end) > Number(item.start)) : [];
    const hasSegmentSequence = segments.length > 1;
    if (hasSegmentSequence) source = await renderSegments(source, project.id, segments, project.edit?.transitions || []);
    const output = join(uploadRoot, `${project.id}-export.mp4`); project.exportProgress = 25; await writeFile(projectPath, JSON.stringify(project, null, 2));
    const start = hasSegmentSequence ? 0 : Math.max(0, Number(project.edit?.start ?? 0));
    const duration = hasSegmentSequence ? null : project.edit?.end ? Math.max(0.1, Number(project.edit.end) - start) : null;
    const renderDuration = duration || (await probe(source)).duration || null;
    if (exportOptions.templateId) {
      const templateFile = join(dataRoot, 'templates.json'); let templates = []; try { templates = JSON.parse(await readFile(templateFile, 'utf8')); } catch {}
      const template = templates.find(item => item.id === exportOptions.templateId); if (template) exportOptions.captionStyle = exportOptions.captionStyle || template.captionStyle;
      project.edit = { ...(project.edit || {}), templateId: exportOptions.templateId };
    }
    if (exportOptions.captionStyle) project.edit = { ...(project.edit || {}), captionStyle: exportOptions.captionStyle };
    const args = ['-y', '-ss', String(start), '-i', source];
    const activeTracks = (project.edit?.tracks || []).filter(track => !track.muted && track.assetId); const requestedAssetIds = [exportOptions.assetId, project.edit?.assetId, ...activeTracks.map(track => track.assetId)].filter(Boolean);
    const overlayAssets = []; for (const assetId of [...new Set(requestedAssetIds)]) { try { const asset = JSON.parse(await readFile(join(dataRoot, `asset-${assetId}.json`), 'utf8')); if (asset?.path) overlayAssets.push({ asset, track: activeTracks.find(track => track.assetId === assetId) || {} }); } catch {} }
    const visualAssets = overlayAssets.filter(item => ['image', 'video'].includes(item.asset.kind)); const audioAsset = overlayAssets.find(item => item.asset.kind === 'audio')?.asset || null;
    const hasVisualOverlay = visualAssets.length > 0; const hasAudioAsset = Boolean(audioAsset?.path);
    let nextInput = 1; const visualInputIndices = []; let audioInputIndex = null; let captionInputIndex = null;
    for (const layer of visualAssets) { if (layer.asset.kind === 'video') args.push('-stream_loop', '-1'); if (layer.asset.kind === 'image') args.push('-loop', '1'); args.push('-i', layer.asset.path); visualInputIndices.push(nextInput++); }
    let filter = project.edit?.aspectRatio === '1:1' ? 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2' : 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2';
    if (project.edit?.hideOriginalCaptions) filter = `${filter},drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.28:color=black@0.82:t=fill`;
    if (project.captionPath) { captionInputIndex = nextInput++; args.push('-f', 'webvtt', '-i', project.captionPath); }
    if (hasAudioAsset) { args.push('-stream_loop', '-1', '-i', audioAsset.path); audioInputIndex = nextInput++; }
    if (exportOptions.burnCaptions && project.captionPath) { const style = project.edit?.captionStyle || {}; const fontSize = Math.max(12, Math.min(72, Number(style.fontSize) || 28)); const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2; const rawColor = String(style.color || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6); const assColor = `&H00${rawColor.slice(4, 6)}${rawColor.slice(2, 4)}${rawColor.slice(0, 2)}`; if (style.animation === 'fade') { const assPath = join(uploadRoot, `${project.id}-animated.ass`); await writeFile(assPath, buildAnimatedAss(project.captions || [], { fontSize, alignment, assColor }), 'utf8'); const captionFile = assPath.replaceAll('\\', '/').replaceAll(':', '\\:'); filter = `subtitles=filename='${captionFile}',${filter}`; } else { const captionFile = project.captionPath.replaceAll('\\', '/').replaceAll(':', '\\:'); filter = `subtitles=filename='${captionFile}':force_style='FontSize=${fontSize},PrimaryColour=${assColor},Alignment=${alignment},Outline=2,MarginV=36',${filter}`; } }
    let fontFile = 'C\\:/Windows/Fonts/arial.ttf'; if (project.edit?.fontAssetId) { try { const fontAsset = JSON.parse(await readFile(join(dataRoot, `asset-${project.edit.fontAssetId}.json`), 'utf8')); if (/\.(ttf|otf)$/i.test(fontAsset.path || '')) fontFile = fontAsset.path.replaceAll('\\', '/').replaceAll(':', '\\:'); } catch {} }
    for (const layer of (project.edit?.layers || [])) if (layer.type === 'text' && layer.text) { const text = escapeDrawtext(layer.text); const size = Math.max(12, Math.min(120, Number(layer.fontSize) || 32)); const y = layer.position === 'bottom' ? 'h-text_h-80' : layer.position === 'middle' ? '(h-text_h)/2' : '80'; const x = layer.align === 'left' ? '80' : layer.align === 'right' ? 'w-text_w-80' : '(w-text_w)/2'; const shadow = layer.shadow ? ':shadowcolor=black@0.65:shadowx=2:shadowy=2' : ''; const border = layer.outline || 'black@0.7'; const box = layer.background && layer.background !== 'transparent' ? `:box=1:boxcolor=${layer.background}@0.72:boxborderw=12` : ''; const fadeIn = layer.animation === 'fade-in' ? ":alpha='if(lt(t\\,0.45)\\,t/0.45\\,1)'" : ''; filter = `${filter},drawtext=fontfile='${fontFile}':text='${text}':fontcolor=${layer.color || 'white'}:fontsize=${size}:borderw=2:bordercolor=${border}${shadow}${box}${fadeIn}:x=${x}:y=${y}`; }
    for (const effect of (project.edit?.effects || [])) { if (effect === 'grayscale') filter += ',hue=s=0'; if (effect === 'warm') filter += ',colorbalance=rs=.08:gs=.03:bs=-.04'; if (effect === 'contrast') filter += ',eq=contrast=1.18:brightness=0.02'; if (effect === 'fade-in') filter += ',fade=t=in:st=0:d=0.5'; if (effect === 'fade-out' && duration) filter += `,fade=t=out:st=${Math.max(0.1, duration - 0.5)}:d=0.5`; }
    if (hasVisualOverlay) { const chains = [`[0:v]${filter}[base0]`]; let base = '[base0]'; for (const [index, inputIndex] of visualInputIndices.entries()) { const layer = visualAssets[index]; const track = layer.track || {}; const assetLabel = `[asset${index}]`; const nextBase = `[base${index + 1}]`; const x = Math.max(0, Number(track.x) || (index % 2 === 0 ? 456 : 24)); const y = Math.max(0, Number(track.y) || (index < 2 ? 960 : 24)); const startAt = Math.max(0, Number(track.start) || 0); const endAt = Number(track.end); const enable = Number.isFinite(endAt) && endAt > startAt ? `between(t\\,${startAt}\\,${endAt})` : `gte(t\\,${startAt})`; chains.push(`[${inputIndex}:v]format=rgba,colorchannelmixer=aa=${Math.max(0.45, 0.72 - index * 0.08).toFixed(2)}${assetLabel}`); chains.push(`${base}${assetLabel}overlay=${x}:${y}:enable='${enable}'${nextBase}`); base = nextBase; } args.push('-filter_complex', chains.join(';'), '-map', base); } else { args.push('-vf', filter, '-map', '0:v:0'); }
    if (hasAudioAsset) args.push('-map', `${audioInputIndex}:a:0`); else args.push('-map', '0:a?');
    if ((hasVisualOverlay || hasAudioAsset) && captionInputIndex === null) args.push('-shortest');
    if (captionInputIndex !== null) args.push('-map', `${captionInputIndex}:0`, '-c:s', 'mov_text');
    if (renderDuration) args.push('-t', String(renderDuration));
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', output);
    project.edit = { ...(project.edit || {}), assetId: exportOptions.assetId || project.edit?.assetId || null };
    try { await execFile('ffmpeg', args, { windowsHide: true, timeoutMs: 300000 }); } catch (error) { project.exportStatus = 'failed'; project.exportProgress = 0; project.exportError = error.message; await writeFile(projectPath, JSON.stringify(project, null, 2)); throw error; }
    const exportMetadata = await probe(output); const expectedSize = project.edit?.aspectRatio === '1:1' ? [720, 720] : [720, 1280]; if (!exportMetadata.duration || exportMetadata.width !== expectedSize[0] || exportMetadata.height !== expectedSize[1]) { project.exportStatus = 'failed'; project.exportProgress = 0; project.exportError = `내보내기 검증 실패: ${exportMetadata.width || 0}x${exportMetadata.height || 0}, ${exportMetadata.duration || 0}초`; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 422, { ok: false, error: project.exportError, metadata: exportMetadata }); return true; }
    project.exportPath = output; project.exportUrl = `/media/${basename(output)}`; project.exportMetadata = exportMetadata; project.exportStatus = 'completed'; project.exportProgress = 100;
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, downloadUrl: project.exportUrl }); return true;
  }
  const editMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/edit$/);
  const tracksMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tracks$/);
  if (req.method === 'POST' && tracksMatch) { const projectPath = join(dataRoot, `${tracksMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}'); const tracks = Array.isArray(payload.tracks) ? payload.tracks.map((track, index) => ({ id: String(track.id || `track-${index + 1}`), name: String(track.name || `트랙 ${index + 1}`), kind: ['video', 'audio', 'text', 'caption', 'overlay'].includes(track.kind) ? track.kind : 'video', assetId: typeof track.assetId === 'string' ? track.assetId : null, start: Math.max(0, Number(track.start) || 0), end: track.end == null ? null : Math.max(0, Number(track.end) || 0), x: Math.max(0, Math.min(720, Number(track.x) || 0)), y: Math.max(0, Math.min(1280, Number(track.y) || 0)), muted: Boolean(track.muted) })) : []; const transitions = Array.isArray(payload.transitions) ? payload.transitions.map(item => ({ from: String(item.from || ''), to: String(item.to || ''), type: ['none', 'fade', 'cut'].includes(item.type) ? item.type : 'none', duration: Math.max(0, Math.min(2, Number(item.duration) || 0.25)) })) : []; project.edit = { ...(project.edit || {}), tracks, transitions, tool: '다중 트랙·전환 상태' }; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, tracks, transitions }); return true; }
  const editHistoryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/edit\/(undo|redo)$/);
  if (req.method === 'POST' && editHistoryMatch) {
    const projectPath = join(dataRoot, `${editHistoryMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const direction = editHistoryMatch[2];
    const history = Array.isArray(project.editHistory) ? project.editHistory : []; const future = Array.isArray(project.editFuture) ? project.editFuture : [];
    if (direction === 'undo' && history.length) { future.push(project.edit || null); project.edit = history.pop(); }
    if (direction === 'redo' && future.length) { history.push(project.edit || null); project.edit = future.pop(); }
    project.editHistory = history; project.editFuture = future; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, edit: project.edit, canUndo: history.length > 0, canRedo: future.length > 0 }); return true;
  }
  if (req.method === 'POST' && editMatch) {
    const projectPath = join(dataRoot, `${editMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'));
    if (project.edit) { project.editHistory = Array.isArray(project.editHistory) ? project.editHistory : []; project.editHistory.push(project.edit); if (project.editHistory.length > 30) project.editHistory.shift(); project.editFuture = []; }
    project.edit = { ...(project.edit || {}), start: Math.max(0, Number(payload.start) || 0), end: payload.end == null ? null : Math.max(0, Number(payload.end)), segments: Array.isArray(payload.segments) ? payload.segments : project.edit?.segments || [], layers: Array.isArray(payload.layers) ? payload.layers : project.edit?.layers || [], effects: Array.isArray(payload.effects) ? payload.effects : project.edit?.effects || [], tracks: Array.isArray(payload.tracks) ? payload.tracks : project.edit?.tracks || [], transitions: Array.isArray(payload.transitions) ? payload.transitions : project.edit?.transitions || [], hideOriginalCaptions: typeof payload.hideOriginalCaptions === 'boolean' ? payload.hideOriginalCaptions : Boolean(project.edit?.hideOriginalCaptions), tool: payload.tool || project.edit?.tool || null, templateId: payload.templateId || project.edit?.templateId || null, assetId: payload.assetId || project.edit?.assetId || null, fontAssetId: payload.fontAssetId || project.edit?.fontAssetId || null, captionStyle: payload.captionStyle || project.edit?.captionStyle || null, aspectRatio: payload.aspectRatio || project.edit?.aspectRatio || '9:16' };
    if (typeof payload.title === 'string' && payload.title.trim()) project.title = payload.title.trim();
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, edit: project.edit }); return true;
  }
  const aiCaptionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ai\/captions\/(correct|translate)$/);
  if (req.method === 'POST' && aiCaptionMatch) {
    const projectPath = join(dataRoot, `${aiCaptionMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
    if (aiCaptionMatch[2] === 'correct') { const sourceCaptions = Array.isArray(payload.captions) ? payload.captions : project.captions || []; const captions = correctCaptionSet(sourceCaptions); project.captions = captions; if (project.selectedClipId) { const clip = project.clips?.find(item => item.id === project.selectedClipId); if (clip) clip.captions = captions; } const vtt = ['WEBVTT', '', ...captions.flatMap((item, index) => [`${index + 1}`, `${toVttTime(item.start)} --> ${toVttTime(item.end)}`, item.text, ''])].join('\n'); const captionPath = join(uploadRoot, `${project.id}.vtt`); await writeFile(captionPath, vtt, 'utf8'); project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`; project.edit = { ...(project.edit || {}), tool: 'AI 자막 교정(로컬)' }; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, provider: 'local-normalizer', captions, captionUrl: project.captionUrl }); return true; }
    const translationUrl = process.env.SKYCLIP_TRANSLATION_URL;
    if (!translationUrl) { json(res, 503, { ok: false, provider: null, error: '번역 API가 연결되지 않았습니다. SKYCLIP_TRANSLATION_URL을 설정하면 실제 번역 API를 호출합니다.' }); return true; }
    const remote = await fetch(translationUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetLanguage: payload.targetLanguage || 'en', captions: project.captions || [] }) }); const result = await remote.json().catch(() => ({})); if (!remote.ok) { json(res, 502, { ok: false, provider: translationUrl, error: result.error || '번역 API 호출에 실패했습니다.' }); return true; } const captions = correctCaptionSet(result.captions || result.translations || []); project.captions = captions; if (project.selectedClipId) { const clip = project.clips?.find(item => item.id === project.selectedClipId); if (clip) clip.captions = captions; } const vtt = ['WEBVTT', '', ...captions.flatMap((item, index) => [`${index + 1}`, `${toVttTime(item.start)} --> ${toVttTime(item.end)}`, item.text, ''])].join('\n'); const captionPath = join(uploadRoot, `${project.id}.vtt`); await writeFile(captionPath, vtt, 'utf8'); project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`; project.edit = { ...(project.edit || {}), tool: `AI 번역:${payload.targetLanguage || 'en'}` }; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, provider: translationUrl, captions, captionUrl: project.captionUrl }); return true;
  }
  const aiMediaMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ai\/media$/);
  if (req.method === 'POST' && aiMediaMatch) { const mediaUrl = process.env.SKYCLIP_MEDIA_API_URL; if (!mediaUrl) { json(res, 503, { ok: false, provider: null, error: '생성형 미디어 API가 연결되지 않았습니다. SKYCLIP_MEDIA_API_URL을 설정하거나 로컬 에셋을 업로드하세요.' }); return true; } const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}'); const remote = await fetch(mediaUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const result = await remote.json().catch(() => ({})); json(res, remote.ok ? 200 : 502, { ok: remote.ok, provider: mediaUrl, ...result }); return true; }
  const regenerateCaptionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/captions\/regenerate$/);
  if (req.method === 'POST' && regenerateCaptionMatch) { const projectPath = join(dataRoot, `${regenerateCaptionMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const payload = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}'); const clip = (project.clips || []).find(item => item.id === payload.clipId) || project.clips?.[0]; const index = Math.max(0, Number(payload.captionIndex) || 0); const current = (project.captions || clip?.captions || [])[index]; if (!clip || !current) { json(res, 404, { ok: false, error: '재생성할 자막 구간을 찾을 수 없습니다.' }); return true; } const source = clip.sourcePreviewUrl ? join(uploadRoot, basename(clip.sourcePreviewUrl)) : project.source; const tempVideo = join(uploadRoot, `${project.id}-caption-regenerate-${index}.mp4`); const tempVtt = join(uploadRoot, `${project.id}-caption-regenerate-${index}.vtt`); const start = Math.max(0, Number(current.start) || 0); const duration = Math.max(0.2, (Number(current.end) || start + 2) - start); await execFile('ffmpeg', ['-y', '-ss', String(start), '-i', source, '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', tempVideo], { windowsHide: true, timeoutMs: 180000 }); const scriptPath = join(fileURLToPath(new URL('.', import.meta.url)), 'scripts', 'stt.py'); const result = await execFile('python', [scriptPath, tempVideo, tempVtt], { windowsHide: true, timeoutMs: 900000 }); const output = JSON.parse(result.stdout.trim()); const regenerated = correctCaptionSet(output.captions || []); if (!regenerated.length) { json(res, 422, { ok: false, error: '선택 구간에서 음성을 인식하지 못했습니다.' }); return true; } const replacement = { ...current, text: regenerated.map(item => item.text).join(' '), words: regenerated.flatMap(item => item.words || []).map(word => ({ ...word, start: Number((Number(word.start || 0) + start).toFixed(3)), end: Number((Number(word.end || 0) + start).toFixed(3)) })) }; const captions = (project.captions || clip.captions || []).map((item, itemIndex) => itemIndex === index ? replacement : item); project.captions = captions; if (clip) clip.captions = captions; const vtt = ['WEBVTT', '', ...captions.flatMap((item, itemIndex) => [`${itemIndex + 1}`, `${toVttTime(item.start)} --> ${toVttTime(item.end)}`, item.text, ''])].join('\n'); const captionPath = join(uploadRoot, `${project.id}.vtt`); await writeFile(captionPath, vtt, 'utf8'); project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`; project.edit = { ...(project.edit || {}), tool: `자막 구간 재생성:${index + 1}` }; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, captions, regeneratedIndex: index, stt: { model: output.model, language: output.language } }); return true; }
  const captionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/captions$/);
  if (req.method === 'POST' && captionMatch) {
    const projectPath = join(dataRoot, `${captionMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'));
    const captions = Array.isArray(payload.captions) ? payload.captions.map(item => ({ start: Number(item.start) || 0, end: Number(item.end) || 0, text: String(item.text || '').slice(0, 500), words: Array.isArray(item.words) ? item.words.map(word => ({ start: Number(word.start) || 0, end: Number(word.end) || 0, text: String(word.text || '').slice(0, 100) })) : [] })) : [];
    const vtt = ['WEBVTT', '', ...captions.flatMap((item, index) => [`${index + 1}`, `${toVttTime(item.start)} --> ${toVttTime(item.end)}`, item.text, ''])].join('\n');
    const captionPath = join(uploadRoot, `${project.id}.vtt`); await writeFile(captionPath, vtt, 'utf8');
    project.captions = captions; project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`;
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, captions, captionUrl: project.captionUrl }); return true;
  }
  const sttMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/stt$/);
  if (req.method === 'POST' && sttMatch) {
    const projectPath = join(dataRoot, `${sttMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    let sttOptions = {}; try { const body = await readBody(req, 256 * 1024); if (body.length) sttOptions = JSON.parse(body.toString('utf8')); } catch {}
    const selectedClip = project.clips?.find(clip => clip.id === project.selectedClipId);
    const selectedClipSource = selectedClip?.previewUrl ? join(uploadRoot, basename(selectedClip.previewUrl)) : null;
    const source = selectedClipSource || project.source || project.previewPath;
    if (!source) throw new Error('자막을 생성할 영상이 없습니다.');
    const captionPath = join(uploadRoot, `${project.id}-stt.vtt`);
    const scriptPath = join(fileURLToPath(new URL('.', import.meta.url)), 'scripts', 'stt.py');
    const model = ['tiny', 'base', 'small', 'medium'].includes(sttOptions.model) ? sttOptions.model : undefined;
    const result = await execFile('python', [scriptPath, source, captionPath, ...(model ? [model] : [])], { windowsHide: true, timeoutMs: 900000 });
    const output = JSON.parse(result.stdout.trim()); if (!output.ok) throw new Error(output.error || 'STT 자막 생성에 실패했습니다.');
    const generatedCaptions = output.captions || [];
    if (generatedCaptions.length) { project.captions = generatedCaptions; project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`; }
    project.stt = { engine: 'faster-whisper', model: output.model, language: output.language, count: generatedCaptions.length, warning: generatedCaptions.length ? null : '음성에서 인식된 대사가 없습니다. 기존 자막은 유지했습니다.', completedAt: new Date().toISOString() };
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, captions: project.captions || [], captionUrl: project.captionUrl || null, stt: project.stt }); return true;
  }
  return false;
}

function toVttTime(seconds) { const safe = Math.max(0, Number(seconds) || 0); const h = Math.floor(safe / 3600); const m = Math.floor((safe % 3600) / 60); const s = (safe % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`; }
function toAssTime(seconds) { const safe = Math.max(0, Number(seconds) || 0); const h = Math.floor(safe / 3600); const m = Math.floor((safe % 3600) / 60); const s = (safe % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${s}`; }
function buildAnimatedAss(captions, style) { const header = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 720', 'PlayResY: 1280', '', '[V4+ Styles]', `Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding`, `Style: Default,Arial,${style.fontSize},${style.assColor},${style.assColor},&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,${style.alignment},36,36,54,1`, '', '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']; const rows = captions.map(item => { const text = String(item.text || '').replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('\n', '\\N'); return `Dialogue: 0,${toAssTime(item.start)},${toAssTime(item.end)},Default,,0,0,0,,{\\fad(120,120)}${text}`; }); return [...header, ...rows].join('\n'); }
function escapeDrawtext(value) { return String(value || '').replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'").replaceAll(',', '\\,').replaceAll('[', '\\[').replaceAll(']', '\\]'); }

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try { if (await handleApi(req, res, url)) return; } catch (error) { json(res, 400, { ok: false, error: error.message }); return; }
  if (url.pathname.startsWith('/media/')) {
    const mediaName = basename(url.pathname.slice('/media/'.length));
    const mediaPath = normalize(join(uploadRoot, mediaName));
    if (!mediaPath.startsWith(uploadRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
    try { const body = await readFile(mediaPath); const type = mediaName.endsWith('.vtt') ? 'text/vtt; charset=utf-8' : mediaName.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4'; res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }); res.end(body); } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    const fallback = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
    res.end(fallback);
  }
});

function listen(nextPort) {
  const onError = (error) => {
    server.removeListener('listening', onListening);
    if (error.code === 'EADDRINUSE' && !process.env.PORT) {
      console.warn(`Port ${nextPort} is busy; trying ${nextPort + 1}.`);
      server.close(() => listen(nextPort + 1));
      return;
    }
    throw error;
  };
  const onListening = () => {
    server.removeListener('error', onError);
    console.log(`SkyClip running at http://127.0.0.1:${nextPort}`);
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(nextPort, '0.0.0.0');
}

listen(requestedPort);
