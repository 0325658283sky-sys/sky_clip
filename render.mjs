import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('사용법: node render.mjs <입력 영상> <출력 영상>');
  process.exit(1);
}

const input = resolve(inputArg);
const output = resolve(outputArg);
const webm = output.toLowerCase().endsWith('.webm');
const args = webm
  ? ['-y', '-i', input, '-vf', "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black", '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', output]
  : ['-y', '-i', input, '-vf', "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black", '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output];
const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });
ffmpeg.on('close', code => process.exit(code ?? 1));
