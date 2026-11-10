import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const dataRoot = join(root, '.skyclip-data');
const uploadRoot = join(dataRoot, 'uploads');
const files = await readdir(dataRoot, { withFileTypes: true });
const projects = [];
for (const entry of files) {
  if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('asset-')) continue;
  try { projects.push(JSON.parse(await readFile(join(dataRoot, entry.name), 'utf8'))); } catch {}
}
const project = projects.filter(item => item.status === 'completed' && item.clips?.length).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
if (!project) throw new Error('완료된 분석 프로젝트가 없습니다.');
const checks = [];
for (const clip of project.clips) {
  const media = join(uploadRoot, basename(clip.previewUrl || ''));
  let mediaSize = 0; try { mediaSize = (await stat(media)).size; } catch {}
  checks.push({ id: clip.id, ready: clip.ready === true, aspectRatio: clip.aspectRatio, media: mediaSize > 0, captions: Array.isArray(clip.captions), title: Boolean(clip.title), score: clip.score == null || Number.isFinite(clip.score) });
}
const result = { projectId: project.id, status: project.status, clips: checks.length, readyClips: checks.filter(item => item.ready && item.media && item.aspectRatio === '9:16').length, checks };
console.log(JSON.stringify(result, null, 2));
if (result.readyClips !== result.clips || checks.some(item => !item.captions || !item.title || !item.score)) process.exitCode = 1;
