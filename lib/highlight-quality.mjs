export function selectHighlightStarts(sceneStarts, total, window, limit = 5) {
  const maxStart = Math.max(0, total - window); const anchors = Array.from({ length: limit }, (_, index) => limit === 1 ? 0 : maxStart * index / (limit - 1));
  const scenes = [...new Set((sceneStarts || []).map(value => Number(value)).filter(value => Number.isFinite(value) && value >= 0 && value <= maxStart).map(value => Number(value.toFixed(2))))].sort((a, b) => a - b);
  const minimumGap = Math.max(3, Math.min(window * 0.45, maxStart / Math.max(1, limit - 1) * 0.55)); const picks = [];
  for (const anchor of anchors) {
    const nearby = scenes.filter(value => !picks.some(pick => Math.abs(pick.start - value) < minimumGap)).sort((left, right) => Math.abs(left - anchor) - Math.abs(right - anchor))[0];
    const fallback = Number(Math.max(0, Math.min(maxStart, anchor)).toFixed(2)); const start = nearby == null ? fallback : nearby;
    if (!picks.some(pick => Math.abs(pick.start - start) < minimumGap)) picks.push({ start, sceneAligned: nearby != null, anchor: Number(anchor.toFixed(2)) });
  }
  for (const scene of scenes) { if (picks.length >= limit) break; if (!picks.some(pick => Math.abs(pick.start - scene) < minimumGap)) picks.push({ start: scene, sceneAligned: true, anchor: null }); }
  return picks.sort((left, right) => left.start - right.start).slice(0, limit);
}

export function buildClipTitle(captions, index) {
  const rows = captions.map(item => String(item.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!rows.length) return `핵심 장면 ${index}`;
  const ranked = rows.map((row, rowIndex) => { const words = row.split(/\s+/).filter(Boolean); const hook = (row.match(/(왜|어떻게|진짜|대박|미쳤|결국|핵심|방법|이유|처음|마지막|주의|성공|실패|추천|놀랍|충격|반전|비밀)/g) || []).length; const completion = /[.!?。！？]|(다|요|죠|니다|세요)$/.test(row) ? 1 : 0; const lengthFit = 1 - Math.min(1, Math.abs(words.length - 7) / 12); return { row, score: hook * 2.4 + completion + lengthFit + (rowIndex === 0 ? 0.35 : 0) }; }).sort((left, right) => right.score - left.score);
  const cleaned = ranked[0].row.replace(/^(그래서|근데|그리고|어|음|저|이제)\s+/u, '').replace(/[.!?。！？]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean).filter(word => /[\p{L}\p{N}]/u.test(word) && word.replace(/[^\p{L}\p{N}]/gu, '').length >= 2).filter((word, wordIndex, all) => wordIndex === 0 || word.replace(/[.,!?。！？,，]+$/g, '') !== all[wordIndex - 1].replace(/[.,!?。！？,，]+$/g, ''));
  const candidate = words.slice(0, 8).join(' ').trim();
  return candidate.length >= 2 ? `${candidate.slice(0, 32)}${candidate.length > 32 ? '…' : ''}` : `핵심 장면 ${index}`;
}
