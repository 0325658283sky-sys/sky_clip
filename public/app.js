const app = document.querySelector('#app');
const state = { route: location.hash.slice(1) || 'dashboard', input: '', file: null, project: null, clipTitle: '제주도 학생의 미친 삼행시 수준', saved: false, history: [], future: [] };
const clips = [['제주도 학생의 미친 삼행시 수준', '00:21', 95], ['사투리 절대 아님 충격주의', '00:58', 93], ['제주도 말은 사실 한국어 아님', '01:03', 93], ['낭만대생이 숨긴 미친 맛집 정체', '01:00', 92], ['외계어 주의?! 제주도판 사랑스러워', '00:22', 90]];
function navigate(route) { state.route = route; location.hash = route; render(); }
function toast(message) { const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 2400); }
function shell(content, active = 'dashboard') { const nav = [['dashboard', '◈', '스튜디오'], ['results', '▣', '프로젝트'], ['templates', '◇', '템플릿'], ['assets', '◌', '에셋 보관함']]; return `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark"></span>SkyClip</div><div class="workspace">작업공간<b>로컬 프로젝트</b></div><div class="nav-label">작업 공간</div>${nav.map(([id, icon, label]) => `<button class="nav-item ${active === id ? 'active' : ''}" data-nav="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}<div class="recent"><div class="nav-label">최근 프로젝트</div><div class="recent-item">제주도 학생의 미친 삼행시</div><div class="recent-item">세바시 797회 샘플</div></div></aside><main class="main"><header class="topbar"><div class="crumbs">스튜디오 <span>/</span> <b>${active === 'dashboard' ? '새 프로젝트' : active === 'results' ? '분석 결과' : active === 'editor' ? '클립 편집기' : active === 'templates' ? '비디오 템플릿' : '에셋 보관함'}</b></div><div class="top-actions"><span class="saved">${state.saved ? '모든 변경사항 저장됨' : '로컬 작업'}</span><span class="credit">무료 로컬 모드</span><span>SK</span></div></header>${content}</main></div>`; }
function dashboard() { return shell(`<section class="page"><div class="hero"><div><div class="eyebrow">AI 영상 작업공간</div><h1 class="page-title">다음 영상을<br><span style="color:#7656e8">멋진 순간으로.</span></h1><p class="page-subtitle">긴 영상을 모든 채널용 숏폼으로 바꿔보세요.</p></div><button class="primary" data-action="new-project">＋ 새 프로젝트</button></div><div class="workspace-grid"><div class="panel panel-pad"><h2 class="panel-title">영상에 생명을 불어넣으세요</h2><p class="muted">영상 파일이나 링크를 입력하면 실제 분석 작업이 시작됩니다.</p><div class="input-row"><input id="source-input" class="input" placeholder="YouTube 또는 영상 링크를 붙여 넣으세요" value="${state.input}"><button class="primary" data-action="analyze">분석 시작</button></div><label class="dropzone" for="file-input"><div><strong>영상 파일을 여기에 놓으세요</strong><span>MP4, MOV 최대 4GB · 로컬 파일 처리</span><small>${state.file ? state.file.name : '파일 선택 또는 드래그 앤 드롭'}</small></div></label><input id="file-input" type="file" accept="video/*" hidden><div class="helper-line">또는 샘플 영상 사용</div><div class="sample"><div class="sample-thumb"></div><div class="sample-info"><b>제주도 학생의 미친 삼행시 샘플</b><span>12:18 · 4K · 한국어</span></div><button class="secondary" data-action="sample">샘플 결과</button></div></div><aside class="panel project-panel"><div class="project-head"><h2>내 프로젝트</h2><span class="project-status">준비 완료</span></div><div class="project-cover"></div><div class="project-foot"><b>제주도 학생의 미친 삼행시</b><div class="muted">최근 분석 · 로컬 저장</div><div class="progress"><i></i></div></div></aside></div></section>`); }
function results() { const media = state.project?.previewUrl ? `<video class="result-video" controls preload="metadata" src="${state.project.previewUrl}"></video>` : '<div class="video-frame"><span>▶</span></div>'; return shell(`<section class="page"><div class="result-header"><div><div class="eyebrow">분석 완료</div><h1 class="page-title" style="font-size:30px">생성 클립</h1><p class="page-subtitle">원본 영상에서 발견한 시청 지속 가능성이 높은 순간입니다.</p></div><button class="secondary" data-nav="dashboard">← 새 영상 분석</button></div><div class="analysis"><div class="panel panel-pad"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="muted">원본 영상</div><h2 class="panel-title">${state.project?.fileName || '제주도 학생의 미친 삼행시'}</h2></div><span class="project-status">분석 완료</span></div><div class="tabs"><button class="tab active">종합</button><button class="tab">훅</button><button class="tab">주제 연결</button><button class="tab">흐름</button><button class="tab">몰입</button><button class="tab">마무리</button></div><div class="analysis-list" style="margin-top:16px">${clips.map(([title, duration, score]) => `<div class="clip-row"><div class="clip-thumb"></div><div><div class="clip-title">${title}</div><div class="clip-meta">${duration} · 자막 포함 · 세로형 미리보기</div></div><div class="score">${score}<small>바이럴 점수</small></div></div>`).join('')}</div></div><aside><div class="panel panel-pad">${media}<h3 style="margin:14px 0 5px">${state.clipTitle}</h3><div class="muted">00:00:00 - 00:00:21</div><div class="score-grid"><div class="score-box"><b>95</b><span>종합</span></div><div class="score-box"><b>A</b><span>주제 연결</span></div><div class="score-box"><b>B</b><span>훅</span></div></div><div style="display:flex;gap:8px;margin-top:15px"><button class="primary" style="flex:1" data-nav="editor">편집</button><button class="secondary">공유</button></div></div><div class="panel panel-pad" style="margin-top:14px"><h3 class="panel-title" style="font-size:15px">AI 도구</h3><div class="muted">제목·자막·무음 구간을 바로 다듬습니다.</div><div style="display:grid;gap:8px;margin-top:14px"><button class="secondary">AI 제목 재생성</button><button class="secondary">AI 자막 교정</button><button class="secondary">무음 구간 제거</button></div></div></aside></div></section>`, 'results'); }
function editor() { const media = state.project?.previewUrl ? `<video class="editor-video" controls preload="metadata" src="${state.project.previewUrl}"></video>` : '<span style="width:54px;height:54px;border:1px solid #fff8;border-radius:50%;display:grid;place-items:center;background:#0005">▶</span>'; return shell(`<section class="editor"><div class="editor-bar"><div><button class="secondary" data-nav="results">← 결과로</button> <b style="margin-left:12px">${state.clipTitle}</b></div><div><button class="secondary" data-action="save">저장하기</button><button class="primary" data-action="export">내보내기</button></div></div><div class="editor-main"><aside class="editor-nav"><div class="muted">에디터 도구</div><div class="tool-list">${['AI 편집', '제목', '자막', '텍스트', '요소', '이미지', '영상', '오디오', '전환효과', '편집 효과', '템플릿', '배경스타일', '설정'].map((x, i) => `<button class="tool ${i === 0 ? 'active' : ''}">${x}</button>`).join('')}</div></aside><div class="canvas"><div class="canvas-inner">${media}</div></div><aside class="inspector"><h2 style="font-size:17px;margin:0">AI 편집</h2><p class="muted">현재 선택된 클립을 빠르게 개선합니다.</p><div class="tool-list">${['AI 제목 재생성', 'AI 이미지 생성', 'AI 텍스트 요소', 'AI 배경음악 생성', 'AI 음향효과 생성', 'AI 음성', '무음 구간 제거', '훅 인트로', '자동 레이아웃', '원본 자막 가리기'].map(x => `<button class="tool">${x}</button>`).join('')}</div></aside></div><div class="timeline"><div class="timeline-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span></div><div class="track"><i></i></div><div class="track"><i style="width:39%;background:#4f87c4"></i></div><div class="timeline-actions"><button>◀ 5초</button><button>◀ 1프레임</button><button>▶ 재생</button><button>1프레임 ▶</button><button>5초 ▶</button><button>＋ 구간 추가</button><span style="margin-left:auto;color:#a9adba;font-size:11px">자동 저장 켜짐 · 9:16</span></div></div></section>`, 'editor'); }
function simplePage(kind) { const templates = kind === 'templates'; return shell(`<section class="page"><div class="hero"><div><div class="eyebrow">${templates ? 'STYLE SYSTEM' : 'ASSET LIBRARY'}</div><h1 class="page-title" style="font-size:30px">${templates ? '비디오 템플릿' : '에셋 보관함'}</h1><p class="page-subtitle">${templates ? '나만의 클립 스타일을 저장하고 반복해서 사용하세요.' : '프로젝트에서 사용할 이미지, 오디오, 비디오, 폰트를 관리하세요.'}</p></div><button class="primary">＋ ${templates ? '새 템플릿' : '파일 업로드'}</button></div><div class="panel panel-pad"><div class="tabs"><button class="tab active">전체</button><button class="tab">이미지</button><button class="tab">오디오</button><button class="tab">비디오</button><button class="tab">폰트</button></div><div class="dropzone" style="min-height:210px;margin-top:22px"><div><strong>${templates ? '기본 스타일을 바탕으로 새 템플릿을 만들어보세요.' : '파일을 끌어오거나 클릭해서 업로드해주세요'}</strong><span>${templates ? '자막, 캔버스 비율, 색상, 텍스트 규칙을 저장할 수 있습니다.' : '로컬 파일은 현재 브라우저에서 안전하게 관리됩니다.'}</span></div></div></div></section>`, kind); }
function render() { app.innerHTML = state.route === 'results' ? results() : state.route === 'editor' ? editor() : state.route === 'templates' ? simplePage('templates') : state.route === 'assets' ? simplePage('assets') : dashboard(); bind(); }
async function createProject() {
  state.input = document.querySelector('#source-input')?.value.trim() || '';
  if (!state.input && !state.file) { toast('영상 링크 또는 파일을 먼저 선택하세요.'); return; }
  try {
    toast(state.file ? '영상 파일을 업로드하는 중입니다.' : '링크 프로젝트를 준비하는 중입니다.');
    const response = state.file ? await fetch('/api/projects', { method: 'POST', headers: { 'content-type': state.file.type || 'video/mp4', 'x-file-name': state.file.name }, body: state.file }) : await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: state.input }) });
    if (!response.ok) throw new Error((await response.json()).error || '프로젝트 생성에 실패했습니다.');
    state.project = await response.json();
    while (state.project.status === 'downloading') {
      toast(`링크 영상 다운로드 중입니다. ${state.project.progress || 5}%`);
      await new Promise(resolve => setTimeout(resolve, 2500));
      const status = await fetch(`/api/projects/${state.project.id}`); state.project = await status.json();
    }
    if (state.project.status === 'failed') throw new Error(state.project.error || '링크 영상 다운로드에 실패했습니다.');
    toast('분석 작업을 시작했습니다.');
    const analyzed = await fetch(`/api/projects/${state.project.id}/analyze`, { method: 'POST' });
    if (!analyzed.ok) throw new Error((await analyzed.json()).error || '분석에 실패했습니다.');
    state.project = await analyzed.json(); clips.splice(0, clips.length, ...(state.project.clips || []).map(clip => [clip.title, `00:${String(Math.round(clip.duration || (clip.end - clip.start))).padStart(2, '0')}`, clip.score, clip.thumbnailUrl])); state.clipTitle = state.project.clips?.[0]?.title || state.clipTitle; navigate('results');
  } catch (error) { toast(error.message); }
}
window.addEventListener('hashchange', () => { state.route = location.hash.slice(1) || 'dashboard'; render(); });
function bind() {
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));
  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', async () => {
    const action = el.dataset.action;
    if (action === 'analyze') createProject();
    if (action === 'sample') navigate('results');
    if (action === 'new-project') document.querySelector('#source-input')?.focus();
    if (action === 'save') { state.saved = true; toast('편집 내용이 저장되었습니다.'); render(); }
    if (action === 'export') {
      if (!state.project?.id) { toast('먼저 영상을 분석하세요.'); return; }
      toast('MP4를 렌더링하는 중입니다.');
      const response = await fetch(`/api/projects/${state.project.id}/export`, { method: 'POST' });
      if (!response.ok) { toast('내보내기에 실패했습니다.'); return; }
      const data = await response.json(); toast('MP4 렌더링이 완료되었습니다.'); window.open(data.downloadUrl, '_blank');
    }
  }));
  document.querySelector('#file-input')?.addEventListener('change', event => { state.file = event.target.files[0]; render(); toast(`${state.file.name} 파일을 선택했습니다.`); });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(item => item.classList.remove('active')); tab.classList.add('active'); }));
  if (state.route === 'results' && state.project?.clips) document.querySelectorAll('.clip-row').forEach((row, index) => { const clip = state.project.clips[index]; if (!clip) return; const thumb = row.querySelector('.clip-thumb'); if (thumb && clip.thumbnailUrl) thumb.style.backgroundImage = `url("${clip.thumbnailUrl}")`; const score = row.querySelector('.score'); if (score && clip.score == null) score.innerHTML = '<small>분석 근거 준비 중</small>'; row.onclick = () => { state.project = { ...state.project, previewUrl: clip.previewUrl }; state.clipTitle = clip.title; render(); }; });
  document.querySelectorAll('.editor-nav .tool, .inspector .tool').forEach(tool => tool.onclick = () => {
    document.querySelectorAll('.tool').forEach(item => item.classList.remove('active')); tool.classList.add('active');
    const name = tool.textContent.trim(); const inspectorPanel = document.querySelector('.inspector'); if (!inspectorPanel) return;
    inspectorPanel.querySelector('.tool-feedback')?.remove(); const panel = document.createElement('div'); panel.className = 'tool-feedback';
    if (name === '제목') { panel.innerHTML = `<h3>제목 편집</h3><input value="${state.clipTitle}"><button>적용</button>`; panel.querySelector('button').onclick = () => { state.clipTitle = panel.querySelector('input').value.trim() || state.clipTitle; const label = document.querySelector('.editor-bar b'); if (label) label.textContent = state.clipTitle; toast('제목이 적용되었습니다.'); }; }
    else if (name === '자막') { panel.innerHTML = '<h3>자막 편집</h3><p>구간별 자막을 입력하고 저장하세요.</p>'; document.querySelector('.caption-editor')?.scrollIntoView({ behavior: 'smooth' }); }
    else if (name === '템플릿') { panel.innerHTML = '<h3>템플릿</h3><p>저장된 템플릿을 관리합니다.</p><button>템플릿 화면 열기</button>'; panel.querySelector('button').onclick = () => navigate('templates'); }
    else if (['이미지', '영상', '오디오', '요소'].includes(name)) { panel.innerHTML = `<h3>${name} 에셋</h3><p>에셋 보관함에서 파일을 선택해 추가할 수 있습니다.</p><button>에셋 보관함 열기</button>`; panel.querySelector('button').onclick = () => navigate('assets'); }
    else if (name === '설정') { panel.innerHTML = '<h3>캔버스 설정</h3><button data-ratio="9:16">9:16 세로</button><button data-ratio="1:1">1:1 정사각형</button>'; panel.querySelectorAll('button').forEach(button => button.onclick = () => { document.querySelector('.canvas-inner').style.aspectRatio = button.dataset.ratio.replace(':', ' / '); toast(`캔버스 비율 ${button.dataset.ratio} 적용`); }); }
    else if (name === '무음 구간 제거' && state.project?.id) { panel.innerHTML = '<h3>무음 구간 제거</h3><p>실제 오디오에서 긴 무음 구간을 제거합니다.</p><button>실행</button>'; panel.querySelector('button').onclick = async () => { toast('무음 구간을 분석하는 중입니다.'); const response = await fetch(`/api/projects/${state.project.id}/tools/silence`, { method: 'POST' }); if (response.ok) { const data = await response.json(); state.project = { ...state.project, previewUrl: data.previewUrl }; toast('무음 구간 제거가 적용되었습니다.'); } else toast('무음 구간 제거에 실패했습니다.'); }; }
    else { panel.innerHTML = `<h3>${name}</h3><p>현재 클립에 ${name} 도구를 선택했습니다.</p><button>선택 상태 저장</button>`; panel.querySelector('button').onclick = () => { state.saved = true; toast(`${name} 선택 상태가 저장되었습니다.`); }; }
    inspectorPanel.append(panel);
  });
  const video = document.querySelector('.editor-video');
  const timelineButtons = [...document.querySelectorAll('.timeline-actions button')];
  if (video && timelineButtons.length) {
    const historyControls = document.createElement('span'); historyControls.className = 'history-controls'; historyControls.innerHTML = '<button title="실행 취소">↶</button><button title="다시 실행">↷</button>';
    document.querySelector('.editor-bar > div:last-child')?.prepend(historyControls);
    const snapshot = () => ({ time: video.currentTime || 0, segment: timelineButtons[5].dataset.segmentStart || null });
    const restore = snap => { video.currentTime = snap.time; if (snap.segment) timelineButtons[5].dataset.segmentStart = snap.segment; };
    const record = () => { state.history.push(snapshot()); state.future = []; };
    historyControls.children[0].onclick = () => { const current = snapshot(); const previous = state.history.pop(); if (!previous) return; state.future.push(current); restore(previous); };
    historyControls.children[1].onclick = () => { const next = state.future.pop(); if (!next) return; state.history.push(snapshot()); restore(next); };
    const move = delta => { video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta)); };
    timelineButtons[0].onclick = () => move(-5);
    timelineButtons[1].onclick = () => move(-1 / 30);
    timelineButtons[2].onclick = () => video.paused ? video.play() : video.pause();
    timelineButtons[3].onclick = () => move(1 / 30);
    timelineButtons[4].onclick = () => move(5);
    timelineButtons[5].onclick = () => { record(); toast(`현재 위치 ${video.currentTime.toFixed(2)}초에 편집 구간을 추가했습니다.`); timelineButtons[5].dataset.segmentStart = video.currentTime.toFixed(2); };
  }
  const inspector = document.querySelector('.inspector');
  if (inspector && state.project?.id) {
    const captionPanel = document.createElement('div'); captionPanel.className = 'caption-editor';
    captionPanel.innerHTML = '<h3>자막 편집</h3><p>구간별 자막을 입력하면 프로젝트에 VTT로 저장합니다.</p><textarea placeholder="00:00-00:05  첫 번째 자막\n00:05-00:10  두 번째 자막"></textarea><button>자막 저장</button>';
    inspector.append(captionPanel);
    captionPanel.querySelector('button').onclick = async () => {
      const lines = captionPanel.querySelector('textarea').value.split('\n').map(line => line.trim()).filter(Boolean);
      const captions = lines.map((line, index) => { const match = line.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.*)$/); return match ? { start: Number(match[1]), end: Number(match[2]), text: match[3] } : { start: index * 5, end: index * 5 + 5, text: line }; });
      const response = await fetch(`/api/projects/${state.project.id}/captions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captions }) });
      if (response.ok) { state.project = { ...state.project, captions, captionUrl: (await response.json()).captionUrl }; toast('자막이 저장되었습니다.'); } else toast('자막 저장에 실패했습니다.');
    };
  }
  const saveEditor = document.querySelector('.editor-bar [data-action="save"]');
  if (saveEditor && state.project?.id) saveEditor.addEventListener('click', async () => {
    const current = document.querySelector('.editor-video')?.currentTime || 0;
    await fetch(`/api/projects/${state.project.id}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: state.clipTitle, start: 0, end: current || null, segments: [{ start: 0, end: current || null }] }) });
  });
  const dropzone = document.querySelector('.dropzone');
  if (dropzone && state.route === 'templates') {
    const templateForm = document.createElement('div'); templateForm.className = 'inline-form'; templateForm.innerHTML = '<input placeholder="템플릿 이름"><button>템플릿 저장</button>'; dropzone.before(templateForm);
    templateForm.querySelector('button').onclick = async () => { const name = templateForm.querySelector('input').value.trim() || '새 템플릿'; const response = await fetch('/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, aspectRatio: '9:16' }) }); if (response.ok) { toast('템플릿이 저장되었습니다.'); templateForm.querySelector('input').value = ''; } else toast('템플릿 저장에 실패했습니다.'); };
  }
  if (dropzone && state.route === 'assets') {
    const assetInput = document.createElement('input'); assetInput.type = 'file'; assetInput.accept = 'image/*,video/*,audio/*,.ttf,.otf'; assetInput.className = 'asset-picker'; dropzone.append(assetInput);
    assetInput.onchange = async () => { const file = assetInput.files[0]; if (!file) return; const response = await fetch('/api/assets', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': file.name, 'x-asset-kind': file.type.split('/')[0] || 'file' }, body: file }); if (response.ok) toast('에셋이 저장되었습니다.'); else toast('에셋 업로드에 실패했습니다.'); };
  }
}
render();
