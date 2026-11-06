import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = 18791;
const base = `http://127.0.0.1:${port}`;
const dataFile = join(tmpdir(), `skyclip-media-${process.pid}.json`);
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', chunk => { output += String(chunk); });
child.stderr.on('data', chunk => { output += String(chunk); });
const wait = async () => { for (let i = 0; i < 40; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`서버 시작 실패\n${output}`); };
const probe = file => new Promise((resolve, reject) => { const probeProcess = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_type', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'pipe'] }); let raw = ''; probeProcess.stdout.on('data', chunk => { raw += String(chunk); }); probeProcess.on('close', code => code === 0 ? resolve(JSON.parse(raw)) : reject(new Error('ffprobe 실패'))); });
try {
  await wait();
  const source = await readFile(new URL('./test-input.mp4', import.meta.url));
  const created = await (await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '미디어 스모크', source: 'local-video', creditCost: 0, requestId: `media-${Date.now()}` }) })).json();
  const uploaded = await (await fetch(`${base}/api/projects/${created.id}/source`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'test-input.mp4' }, body: source })).json();
  const clips = uploaded.project?.resultSet?.clips || [];
  if (clips.length !== 6 || !clips.some(clip => clip.previewUrl)) throw new Error('결과 클립 메타데이터가 부족합니다.');
  let checked = 0;
  for (const clip of clips.filter(item => item.previewUrl)) { const file = join(tmpdir(), `skyclip-clip-${process.pid}-${checked}.mp4`); await writeFile(file, Buffer.from(await (await fetch(`${base}${clip.previewUrl}`)).arrayBuffer())); const media = await probe(file); const video = media.streams?.find(stream => stream.codec_type === 'video'); if (video?.width !== 1080 || video?.height !== 1920) throw new Error(`세로 출력 해상도 불일치: ${video?.width}x${video?.height}`); await unlink(file).catch(() => {}); checked += 1; }
  console.log(`PASS media smoke: ${checked}개 실제 클립, 1080x1920 검증`);
} finally { child.kill(); await unlink(dataFile).catch(() => {}); }
