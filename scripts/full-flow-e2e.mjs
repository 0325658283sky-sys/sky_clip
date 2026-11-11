import { readFile } from 'node:fs/promises';

const base = process.argv[2] || process.env.SKYCLIP_URL || 'http://127.0.0.1:8787';
const request = async (path, options) => { const response = await fetch(`${base}${path}`, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`${options?.method || 'GET'} ${path} failed: ${response.status} ${body.error || ''}`); return body; };
const source = await readFile(new URL('../test-e2e.mp4', import.meta.url));
const createResponse = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': 'full-flow-e2e.mp4' }, body: source });
const project = await createResponse.json().catch(() => ({}));
if (!createResponse.ok || !project.id) throw new Error(`영상 업로드 실패: ${project.error || createResponse.status}`);
const analyzed = await request(`/api/projects/${project.id}/analyze`, { method: 'POST' });
const clip = analyzed.clips?.[0]; if (!clip?.previewUrl || !clip?.id) throw new Error('분석 결과 클립이 생성되지 않았습니다.');
await request(`/api/projects/${project.id}/select`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clipId: clip.id }) });
const edit = await request(`/api/projects/${project.id}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '전체 흐름 E2E', aspectRatio: '9:16', layers: [{ id: 'full-flow-title', type: 'text', role: 'title', text: '전체 흐름 E2E', x: 0.5, y: 0.16, fontSize: 38, rotation: -8, color: '#ffffff', shadow: true }], tool: '전체 흐름 E2E' }) });
const exported = await request(`/api/projects/${project.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ burnCaptions: true }) });
const download = await fetch(new URL(exported.downloadUrl, base)); const bytes = Number(download.headers.get('content-length') || 0);
const reloaded = await request(`/api/projects/${project.id}`);
const result = { projectId: project.id, status: reloaded.status, clips: reloaded.clips?.length || 0, selectedClipId: reloaded.selectedClipId, rotatedTitle: reloaded.edit?.layers?.[0]?.rotation, exportStatus: reloaded.exportStatus, downloadStatus: download.status, downloadBytes: bytes };
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'completed' || !result.clips || result.selectedClipId !== clip.id || result.rotatedTitle !== -8 || result.exportStatus !== 'completed' || !download.ok || bytes <= 0) process.exitCode = 1;
