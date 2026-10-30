import { readFile } from 'node:fs/promises';

const files = ['index.html', 'styles.css', 'app.js', 'server.mjs', 'render.mjs'];
for (const file of files) await readFile(new URL(`./${file}`, import.meta.url));
const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
const data = await readFile(new URL('./skyclip-data.json', import.meta.url), 'utf8');
const checks = [
  ['자막 편집', app.includes('contentEditable')],
  ['컷 저장', app.includes('skyclip-cuts')],
  ['프로젝트 API', server.includes('/api/projects')],
  ['자막 API', server.includes('/captions')],
  ['내보내기 API', server.includes('/export')],
  ['FFmpeg 렌더러', (await readFile(new URL('./render.mjs', import.meta.url), 'utf8')).includes('ffmpeg')]
  ,['데이터 파일 JSON', (() => { try { JSON.parse(data); return true; } catch { return false; } })()]
  ,['브라우저 선택자 초기화', !/(^|[^$])\('(\.transcript p|\.timeline-action)'\)/.test(app)]
  ,['REA 입력 흐름', app.includes('sourceInput') && app.includes('fileInput') && app.includes('dropzone')]
  ,['REA 크레딧', app.includes('credit') || app.includes('크레딧')]
  ,['REA 생성 도구', ['이미지','영상','배경음악','음향효과','목소리'].every(label => app.includes(label))]
  ,['REA 샘플 진입', app.includes('sampleBtn') && app.includes('샘플')]
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
