import { access, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = resolve(process.argv[2] || 'test-e2e.mp4');
const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[3] || join(root, '..', '.skyclip-data', 'verified-clip.mp4'));

function run(file, args) { return new Promise((resolveRun, reject) => { const child = spawn(file, args, { windowsHide: true }); let stdout = ''; let stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; }); child.on('error', reject); child.on('close', code => { if (code === 0) resolveRun({ stdout, stderr }); else reject(new Error(stderr)); }); }); }
await access(input);
const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'json', input]);
const metadata = JSON.parse(probe.stdout);
await run('ffmpeg', ['-y', '-ss', '1', '-i', input, '-t', '3', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', output]);
const outputStat = await stat(output);
if (!outputStat.size) throw new Error('검증 출력 파일이 비어 있습니다.');
console.log(JSON.stringify({ ok: true, input, output, duration: metadata.format?.duration, streams: metadata.streams?.map(stream => ({ codec: stream.codec_name, width: stream.width || null, height: stream.height || null })), outputBytes: outputStat.size }, null, 2));
