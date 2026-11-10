import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

async function extractClip(sourcePath, projectId, index, start, end) {
  const clipPath = join(uploadRoot, `${projectId}-clip-${index}.mp4`); const thumbPath = join(uploadRoot, `${projectId}-clip-${index}.jpg`);
  const duration = Math.max(0.5, end - start);
  await execFile('ffmpeg', ['-y', '-ss', String(start), '-i', sourcePath, '-t', String(duration), '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', clipPath], { windowsHide: true, timeoutMs: 180000 });
  await execFile('ffmpeg', ['-y', '-ss', String(start), '-i', sourcePath, '-frames:v', '1', '-q:v', '3', thumbPath], { windowsHide: true, timeoutMs: 60000 });
  const audio = await measureAudio(clipPath, duration);
  const durationFit = Math.max(0, Math.min(1, 1 - Math.abs(duration - 22) / 22));
  const scoreBreakdown = { speechCoverage: audio.speechCoverage, silenceEvents: audio.silenceEvents, durationFit: Number(durationFit.toFixed(3)), evidence: ['실제 오디오 무음 구간', '클립 길이'] };
  return { id: `${projectId}-${index}`, start, end, duration, title: `핵심 장면 ${index}`, score: audio.score, scoreType: '기초 오디오 지표', metrics: audio, scoreBreakdown, previewUrl: `/media/${basename(clipPath)}`, thumbnailUrl: `/media/${basename(thumbPath)}` };
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
    for (const entry of entries) if (entry.isFile() && entry.name.endsWith('.json')) { try { projects.push(JSON.parse(await readFile(join(dataRoot, entry.name), 'utf8'))); } catch {} }
    projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); json(res, 200, { projects }); return true;
  }
  const projectGet = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectGet) { const projectPath = join(dataRoot, `${projectGet[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const started = Date.parse(project.downloadStartedAt || ''); if (project.status === 'downloading' && Number.isFinite(started) && Date.now() - started > 60000) { project.status = 'failed'; project.progress = 0; project.error = '링크 영상 다운로드가 60초 이상 진행되지 않아 중단되었습니다. 다시 시도해 주세요.'; project.updatedAt = new Date().toISOString(); await writeFile(projectPath, JSON.stringify(project, null, 2)); } json(res, 200, project); return true; }
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
    const total = Number(project.metadata?.duration || 15); const firstEnd = Math.min(15, total); const secondStart = Math.min(15, total); const secondEnd = Math.min(35, total);
    project.clips = [await extractClip(project.source, project.id, 1, 0, firstEnd)];
    if (secondEnd > secondStart + 0.5) project.clips.push(await extractClip(project.source, project.id, 2, secondStart, secondEnd));
    project.status = 'completed'; project.progress = 100;
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, project); return true;
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  const toolMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/tools\/([^/]+)$/);
  if (req.method === 'POST' && toolMatch && toolMatch[2] === 'silence') {
    const projectPath = join(dataRoot, `${toolMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8')); const source = project.previewPath || project.source; const output = join(uploadRoot, `${project.id}-silence.mp4`);
    await execFile('ffmpeg', ['-y', '-i', source, '-af', 'silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-35dB', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', output], { windowsHide: true, timeoutMs: 180000 });
    project.previewPath = output; project.previewUrl = `/media/${basename(output)}`; await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, previewUrl: project.previewUrl }); return true;
  }
  if (req.method === 'POST' && exportMatch) {
    const projectPath = join(dataRoot, `${exportMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    let exportOptions = {}; try { const body = await readBody(req, 1024 * 1024); if (body.length) exportOptions = JSON.parse(body.toString('utf8')); } catch {}
    const source = project.previewPath || project.source; if (!source) throw new Error('내보낼 영상이 없습니다.');
    const output = join(uploadRoot, `${project.id}-export.mp4`);
    const start = Math.max(0, Number(project.edit?.start ?? 0));
    const duration = project.edit?.end ? Math.max(0.1, Number(project.edit.end) - start) : null;
    if (exportOptions.templateId) {
      const templateFile = join(dataRoot, 'templates.json'); let templates = []; try { templates = JSON.parse(await readFile(templateFile, 'utf8')); } catch {}
      const template = templates.find(item => item.id === exportOptions.templateId); if (template) exportOptions.captionStyle = exportOptions.captionStyle || template.captionStyle;
      project.edit = { ...(project.edit || {}), templateId: exportOptions.templateId };
    }
    if (exportOptions.captionStyle) project.edit = { ...(project.edit || {}), captionStyle: exportOptions.captionStyle };
    const args = ['-y', '-ss', String(start), '-i', source];
    let overlayAsset = null;
    if (exportOptions.assetId) { try { overlayAsset = JSON.parse(await readFile(join(dataRoot, `asset-${exportOptions.assetId}.json`), 'utf8')); } catch {} }
    const hasVisualOverlay = Boolean(overlayAsset?.path && ['image', 'video'].includes(overlayAsset.kind));
    const hasAudioAsset = Boolean(overlayAsset?.path && overlayAsset.kind === 'audio');
    let nextInput = 1; let visualInputIndex = null; let audioInputIndex = null; let captionInputIndex = null;
    if (hasVisualOverlay) { if (overlayAsset.kind === 'video') args.push('-stream_loop', '-1'); args.push('-i', overlayAsset.path); visualInputIndex = nextInput++; }
    let filter = 'scale=720:-2';
    if (duration) args.push('-t', String(duration));
    if (project.captionPath) { captionInputIndex = nextInput++; args.push('-f', 'webvtt', '-i', project.captionPath); }
    if (hasAudioAsset) { args.push('-stream_loop', '-1', '-i', overlayAsset.path); audioInputIndex = nextInput++; }
    if (exportOptions.burnCaptions && project.captionPath) { const captionFile = project.captionPath.replaceAll('\\', '/').replaceAll(':', '\\:'); const style = project.edit?.captionStyle || {}; const fontSize = Math.max(12, Math.min(72, Number(style.fontSize) || 28)); const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2; const rawColor = String(style.color || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6); const assColor = `&H00${rawColor.slice(4, 6)}${rawColor.slice(2, 4)}${rawColor.slice(0, 2)}`; filter = `subtitles=filename='${captionFile}':force_style='FontSize=${fontSize},PrimaryColour=${assColor},Alignment=${alignment},Outline=2,MarginV=36',${filter}`; }
    for (const layer of (project.edit?.layers || [])) if (layer.type === 'text' && layer.text) { const text = escapeDrawtext(layer.text); const size = Math.max(12, Math.min(96, Number(layer.fontSize) || 32)); const y = layer.position === 'bottom' ? 'h-text_h-80' : layer.position === 'middle' ? '(h-text_h)/2' : '80'; filter = `${filter},drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${text}':fontcolor=${layer.color || 'white'}:fontsize=${size}:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=${y}`; }
    for (const effect of (project.edit?.effects || [])) { if (effect === 'grayscale') filter += ',hue=s=0'; if (effect === 'warm') filter += ',colorbalance=rs=.08:gs=.03:bs=-.04'; if (effect === 'contrast') filter += ',eq=contrast=1.18:brightness=0.02'; if (effect === 'fade-in') filter += ',fade=t=in:st=0:d=0.5'; if (effect === 'fade-out' && duration) filter += `,fade=t=out:st=${Math.max(0.1, duration - 0.5)}:d=0.5`; }
    if (hasVisualOverlay) { args.push('-filter_complex', `[0:v]${filter}[base];[${visualInputIndex}:v]format=rgba,colorchannelmixer=aa=0.65[asset];[base][asset]overlay=W-w-24:H-h-24[vout]`, '-map', '[vout]'); } else { args.push('-vf', filter, '-map', '0:v:0'); }
    if (hasAudioAsset) args.push('-map', `${audioInputIndex}:a:0`); else args.push('-map', '0:a?');
    if (hasVisualOverlay || hasAudioAsset) args.push('-shortest');
    if (captionInputIndex !== null) args.push('-map', `${captionInputIndex}:0`, '-c:s', 'mov_text');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', output);
    project.edit = { ...(project.edit || {}), assetId: exportOptions.assetId || project.edit?.assetId || null };
    await execFile('ffmpeg', args, { windowsHide: true });
    project.exportPath = output; project.exportUrl = `/media/${basename(output)}`; project.exportStatus = 'completed';
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, downloadUrl: project.exportUrl }); return true;
  }
  const editMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/edit$/);
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
    project.edit = { start: Math.max(0, Number(payload.start) || 0), end: payload.end == null ? null : Math.max(0, Number(payload.end)), segments: Array.isArray(payload.segments) ? payload.segments : [], layers: Array.isArray(payload.layers) ? payload.layers : project.edit?.layers || [], effects: Array.isArray(payload.effects) ? payload.effects : project.edit?.effects || [], tool: payload.tool || project.edit?.tool || null, templateId: payload.templateId || project.edit?.templateId || null, assetId: payload.assetId || project.edit?.assetId || null, captionStyle: payload.captionStyle || project.edit?.captionStyle || null };
    if (typeof payload.title === 'string' && payload.title.trim()) project.title = payload.title.trim();
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, edit: project.edit }); return true;
  }
  const captionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/captions$/);
  if (req.method === 'POST' && captionMatch) {
    const projectPath = join(dataRoot, `${captionMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    const payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'));
    const captions = Array.isArray(payload.captions) ? payload.captions.map(item => ({ start: Number(item.start) || 0, end: Number(item.end) || 0, text: String(item.text || '').slice(0, 500) })) : [];
    const vtt = ['WEBVTT', '', ...captions.flatMap((item, index) => [`${index + 1}`, `${toVttTime(item.start)} --> ${toVttTime(item.end)}`, item.text, ''])].join('\n');
    const captionPath = join(uploadRoot, `${project.id}.vtt`); await writeFile(captionPath, vtt, 'utf8');
    project.captions = captions; project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`;
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, captions, captionUrl: project.captionUrl }); return true;
  }
  const sttMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/stt$/);
  if (req.method === 'POST' && sttMatch) {
    const projectPath = join(dataRoot, `${sttMatch[1]}.json`); const project = JSON.parse(await readFile(projectPath, 'utf8'));
    const source = project.previewPath || project.source; if (!source) throw new Error('자막을 생성할 영상이 없습니다.');
    const captionPath = join(uploadRoot, `${project.id}-stt.vtt`);
    const scriptPath = join(fileURLToPath(new URL('.', import.meta.url)), 'scripts', 'stt.py');
    const result = await execFile('python', [scriptPath, source, captionPath], { windowsHide: true, timeoutMs: 900000 });
    const output = JSON.parse(result.stdout.trim()); if (!output.ok) throw new Error(output.error || 'STT 자막 생성에 실패했습니다.');
    const generatedCaptions = output.captions || [];
    if (generatedCaptions.length) { project.captions = generatedCaptions; project.captionPath = captionPath; project.captionUrl = `/media/${basename(captionPath)}`; }
    project.stt = { engine: 'faster-whisper', model: output.model, language: output.language, count: generatedCaptions.length, warning: generatedCaptions.length ? null : '음성에서 인식된 대사가 없습니다. 기존 자막은 유지했습니다.', completedAt: new Date().toISOString() };
    await writeFile(projectPath, JSON.stringify(project, null, 2)); json(res, 200, { ok: true, captions: project.captions || [], captionUrl: project.captionUrl || null, stt: project.stt }); return true;
  }
  return false;
}

function toVttTime(seconds) { const safe = Math.max(0, Number(seconds) || 0); const h = Math.floor(safe / 3600); const m = Math.floor((safe % 3600) / 60); const s = (safe % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`; }
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
