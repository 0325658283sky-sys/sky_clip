import { buildClipTitle, selectHighlightStarts } from '../lib/highlight-quality.mjs';

const picks = selectHighlightStarts([3, 14, 29, 45, 64, 78], 100, 22, 5);
if (picks.length < 4) throw new Error(`Expected at least four diverse candidates, got ${picks.length}`);
if (picks[0].start !== 3 || picks.at(-1).start < 64) throw new Error(`Candidates are not distributed across the source: ${JSON.stringify(picks)}`);
if (new Set(picks.map(item => item.start)).size !== picks.length) throw new Error('Duplicate highlight starts were selected.');
const short = selectHighlightStarts([1, 4], 12, 12, 5);
if (short.length !== 1 || short[0].start !== 0) throw new Error(`Short source fallback is invalid: ${JSON.stringify(short)}`);
const title = buildClipTitle([{ text: '어 진짜 핵심 방법은 처음 세 단계만 지키는 겁니다.' }], 1);
if (!title.includes('핵심 방법') || title.length < 2) throw new Error(`Unexpected generated title: ${title}`);
const fallbackTitle = buildClipTitle([{ text: '...' }], 2);
if (fallbackTitle !== '핵심 장면 2') throw new Error(`Expected fallback title, got ${fallbackTitle}`);
console.log(JSON.stringify({ picks, title, fallbackTitle }, null, 2));
