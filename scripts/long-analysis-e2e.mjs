import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || process.env.SKYCLIP_URL || 'http://127.0.0.1:8787';
const fixture = fileURLToPath(new URL('../.skyclip-data/long-analysis-e2e.mp4', import.meta.url));
const run = (file, args) => new Promise((resolve, reject) => { const child = spawn(file, args, { windowsHide: true }); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `${file} failed`))); });
const request = async (path, options) => { const response = await fetch(`${base}${path}`, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`${options?.method || 'GET'} ${path} failed: ${response.status} ${body.error || ''}`); return body; };

await rm(fixture, { force: true });
await run('ffmpeg', ['-y', '-stream_loop', '7', '-i', fileURLToPath(new URL('../test-e2e.mp4', import.meta.url)), '-t', '60', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', fixture]);
const body = await readFile(fixture);
const created = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'long-analysis-e2e.mp4' }, body }); const project = await created.json().catch(() => ({}));
if (!created.ok || !project.id) throw new Error(`장편 테스트 업로드 실패: ${project.error || created.status}`);
const analyzed = await request(`/api/projects/${project.id}/analyze`, { method: 'POST' });
const starts = (analyzed.clips || []).map(clip => Number(clip.start)); const uniqueStarts = new Set(starts); const span = starts.length ? Math.max(...starts) - Math.min(...starts) : 0;
const result = { projectId: project.id, duration: Number(analyzed.metadata?.duration || 0), clips: analyzed.clips?.length || 0, starts, uniqueStarts: uniqueStarts.size, span, selector: analyzed.analysisEvidence?.selector };
console.log(JSON.stringify(result, null, 2));
if (result.duration < 55 || result.clips < 3 || result.uniqueStarts !== result.clips || result.span < 20) process.exitCode = 1;
