/* ============================================================================
   [3.1] БАЗЫ ДАННЫХ (IndexedDB для видеофайлов + localStorage для текста)
   ============================================================================ */
const STORAGE_KEY = 'sciweb_webinars_v4';
const GROQ_KEY_STORAGE = 'sciweb_groq_key';
const DEEPSEEK_KEY_STORAGE = 'sciweb_deepseek_key';
const memoryFallback = { webinars: [] };
let pendingVideoFile = null;

const VideoDB = {
  dbPromise: null,
  open(){
    if(this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('neti_videos_db', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  },
  async save(id, file){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async get(id){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  },
  async remove(id){
    const db = await this.open();
    return new Promise(res => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => res();
    });
  }
};

function getWebinars(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw !== null){
      const list = JSON.parse(raw);
      if(Array.isArray(list)) return list;
    }
  }catch(e){}
  return memoryFallback.webinars;
}

function saveWebinars(list){
  memoryFallback.webinars = list;
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }catch(e){}
}

/* ============================================================================
   [3.2] РОУТЕР (ПЕРЕКЛЮЧЕНИЕ МЕЖДУ СТРАНИЦАМИ)
   ============================================================================ */
const state = { page:'home', subject:null, id:null, search:'' };

function go(page, param){
  state.page = page;
  state.subject = (page==='physics'||page==='math') ? page : null;
  state.id = (page==='detail') ? param : null;
  state.search = '';
  render();
}

function render(){
  const app = document.getElementById('app');
  if(!app) return;

  if(state.page==='home') renderHome(app);
  else if(state.page==='physics'||state.page==='math') renderList(app, state.page);
  else if(state.page==='detail') renderDetail(app, state.id);
  else renderHome(app);

  document.querySelectorAll('nav a').forEach(a=>a.classList.remove('active'));
  const navKey = state.page==='detail' ? (state.subject||'home') : state.page;
  const activeLink = document.querySelector(`nav a[data-nav="${navKey}"]`);
  if(activeLink) activeLink.classList.add('active');
  window.scrollTo(0,0);
}

/* ============================================================================
   [3.3] УТИЛИТЫ И ГЕНЕРАТОР SVG-ОБЛОЖЕК
   ============================================================================ */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeXml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
function formatDate(d){ const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); }
function countBySubject(s){ return getWebinars().filter(w=>w.subject===s).length; }
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function closePreview(){ document.getElementById('previewBody').innerHTML = ''; closeModal('previewModal'); }

function makePlaceholder(subject, title){
  const isPhys = subject==='physics';
  const c1 = isPhys?'#22d3ee':'#f472b6';
  const c2 = isPhys?'#0b3b45':'#4a1a35';
  const icon = isPhys?'⚛':'∑';
  const label = isPhys?'ФИЗИКА':'МАТЕМАТИКА';
  const safeTitle = escapeXml(title.length>34?title.slice(0,32)+'…':title);
  const svg = `<svg xmlns="http://w3.org" width="640" height="360" viewBox="0 0 640 360">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="#0a0e17"/></linearGradient>
    <radialGradient id="r" cx="0.8" cy="0.15" r="0.85"><stop offset="0" stop-color="${c1}" stop-opacity="0.55"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient></defs>
    <rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#r)"/>
    <text x="320" y="165" font-family="Arial" font-size="110" font-weight="700" fill="${c1}" fill-opacity="0.9" text-anchor="middle">${icon}</text>
    <text x="320" y="235" font-family="Arial" font-size="17" font-weight="700" fill="${c1}" letter-spacing="4" text-anchor="middle">${label}</text>
    <text x="320" y="272" font-family="Arial" font-size="15" fill="#c9d3e8" text-anchor="middle">${safeTitle}</text>
    <text x="320" y="320" font-family="Arial" font-size="12" fill="#8892a8" text-anchor="middle">НГТУ НЭТИ и Тима</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

/* ============================================================================
   [3.4] ОТРИСОВКА ЭКРАНОВ (ГЛАВНАЯ, СПИСОК С ПОИСКОМ, СТРАНИЦА УРОКА)
   ============================================================================ */
function renderHome(app){
  app.innerHTML = `
    <section class="hero">
      <h1>Вебинары по <span class="grad">физике и математике</span></h1>
      <p>Перетащите видеофайл прямо на страницу — ИИ расшифрует голос и выпишет формулы</p>
    </section>
    <div class="sections">
      <div class="section-card physics" onclick="go('physics')">
        <button class="add-mini" onclick="event.stopPropagation();openAddModal('physics')">+ Добавить</button>
        <div class="icon">⚛</div><h2>Физика</h2><p>Механика, электричество, термодинамика и квантовая физика</p>
        <div class="count">${countBySubject('physics')} вебинаров →</div>
      </div>
      <div class="section-card math" onclick="go('math')">
        <button class="add-mini" onclick="event.stopPropagation();openAddModal('math')">+ Добавить</button>
        <div class="icon">∑</div><h2>Математика</h2><p>Матанализ, алгебра, геометрия, производные и интегралы</p>
        <div class="count">${countBySubject('math')} вебинаров →</div>
      </div>
    </div>`;
}

function renderList(app, subject){
  const q = state.search.toLowerCase().trim();
  const items = getWebinars()
    .filter(w => w.subject === subject)
    .filter(w => !q || [w.title, w.description, w.aiSummary, ...(w.aiFormulas||[])].join(' ').toLowerCase().includes(q))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  const title = subject==='physics' ? 'Физика' : 'Математика';
  const icon = subject==='physics' ? '⚛' : '∑';
  const empty = `<div class="empty"><div class="empty-icon">${icon}</div><h3>${q ? 'Ничего не найдено' : 'Пока нет вебинаров'}</h3><p>${q ? 'Попробуйте изменить запрос' : 'Перетащите видеофайл на экран или нажмите кнопку ниже'}</p><button class="btn primary" onclick="openAddModal('${subject}')">+ Добавить вебинар</button></div>`;

  app.innerHTML = `
    <div class="page-head">
      <span class="back" onclick="go('home')">← Назад</span>
      <h1>${title}</h1>
      <div class="head-actions">
        <input class="search-bar" placeholder="🔍 Поиск по урокам и формулам..." value="${escapeHtml(state.search)}" oninput="state.search=this.value;renderList(document.getElementById('app'),'${subject}')">
        <button class="btn primary" onclick="openAddModal('${subject}')">+ Добавить вебинар</button>
      </div>
    </div>
    ${items.length ? `<div class="grid">${items.map(cardHTML).join('')}</div>` : empty}`;
}

function cardHTML(w){
  const parsed = parseVideoLink(w.rawUrl || w.videoId);
  const img = w.thumbnail || (parsed?.thumb ? parsed.thumb : makePlaceholder(w.subject, w.title));
  return `<div class="card">
    <div class="thumb" style="background-image:url('${img}')">
      <button class="preview-btn" onclick="event.stopPropagation();openPreview('${w.id}')" title="Быстрый просмотр видео">▶</button>
      <span class="duration">${w.duration} мин</span>
    </div>
    <div class="card-body">
      <div class="card-date">${formatDate(w.date)}</div>
      <h3>${escapeHtml(w.title)}</h3>
      <p class="muted small">${escapeHtml(w.description||'')}</p>
      <div class="card-actions">
        <button class="btn" style="flex:1;justify-content:center" onclick="go('detail','${w.id}')">Открыть и конспект →</button>
        <button class="btn danger" onclick="deleteWebinar('${w.id}')" title="Удалить вебинар">🗑</button>
      </div>
    </div>
  </div>`;
}

function renderDetail(app, id){
  const w = getWebinars().find(x => x.id === id);
  if(!w){ go('home'); return; }
  const hasAI = Boolean(w.aiSummary || (w.aiFormulas && w.aiFormulas.length));

  app.innerHTML = `
    <div class="page-head">
      <span class="back" onclick="go('${w.subject}')">← К списку</span>
      <div class="head-actions">
        <button class="btn danger" onclick="deleteWebinar('${w.id}')">🗑 Удалить вебинар</button>
      </div>
    </div>
    <div class="detail">
      <div class="video-wrap" id="detailPlayer"></div>
      <div class="detail-info">
        <span class="badge ${w.subject}">${w.subject==='physics'?'Физика':'Математика'}</span>
        <h1>${escapeHtml(w.title)}</h1>
        <p class="muted">${formatDate(w.date)} · ${w.duration} мин</p>
        ${w.description ? `<p style="margin-top:12px">${escapeHtml(w.description)}</p>` : ''}
      </div>

      <div class="ai-panel">
        <div class="ai-head">
          <div class="ai-title">🤖 Разбор от ИИ</div>
          <button class="btn primary" id="aiBtn">${hasAI ? 'Пересобрать' : 'Анализировать'}</button>
        </div>
        <div id="aiResult" class="ai-result">
          ${hasAI ? renderAIResult(w) : '<p class="muted small">ИИ автоматически прослушает видео и подготовит разбор с формулами...</p>'}
        </div>
      </div>
    </div>`;

  mountPlayer(document.getElementById('detailPlayer'), w, false);
  const aiBtn = document.getElementById('aiBtn');
  aiBtn.onclick = () => runAI(w);

  // Автозапуск: если видео загружено и разбора ещё нет — ИИ сразу анализирует его один раз
  if(w.videoType === 'local' && !w.aiSummary && !w._autoStarted){
    w._autoStarted = true;
    setTimeout(() => runAI(w), 300);
  }
}


/* ============================================================================
   [3.5] ВИДЕОПЛЕЕР И ПАРСЕР ССЫЛОК
   ============================================================================ */
function parseVideoLink(raw){
  let s = String(raw||'').trim().replace(/&amp;/g, '&');
  if(!s) return null;
  const srcMatch = s.match(/src=["']([^"']+)["']/i);
  if(srcMatch) s = srcMatch.at(1);
  if(s.startsWith('//')) s = 'https:' + s;

  // YouTube
  const yt = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
  if(yt) return { type:'iframe', url:'https://' + '://youtube.com' + yt.at(1) + '?autoplay=1&rel=0', thumb:'https://' + '://youtube.com' + yt.at(1) + '/hqdefault.jpg' };

  // VK Видео
  if(/video_ext\.php/i.test(s)) return { type:'iframe', url:s };
  const vk = s.match(/(?:video|clip)(-?\d+)_(\d+)/i);
  if(vk) return { type:'iframe', url:'https://' + '://vk.com' + vk.at(1) + '&id=' + vk.at(2) + '&hd=2' };

  // RuTube
  const rt = s.match(/rutube\.ru\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/);
  if(rt) return { type:'iframe', url:'https://' + 'rutube.ru/play/embed/' + rt.at(1) };

  // Google Drive
const gd = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{10,})/);
if(gd) return { type:'iframe', url:'https://' + '://google.com' + gd.at(1) + '/preview' };

  if(/^https?:\/\//i.test(s)){
    return /disk\.yandex|yadi\.sk/i.test(s) ? { type:'yadisk', url:s } : { type:'video', url:s };
  }
  return null;
}


async function mountPlayer(container, w, autoplay){
  if(w.videoType === 'local'){
    const file = await VideoDB.get(w.id);
    if(!file){
      container.innerHTML = `<div class="video-note">
        <div style="margin-bottom:8px">🎬 Локальный файл не найден в памяти этого браузера</div>
        <div class="small muted">Перетащите видеофайл прямо на это окно, чтобы прикрепить его</div>
      </div>`;
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    container.innerHTML = `<video src="${blobUrl}" controls ${autoplay ? 'autoplay' : ''} playsinline></video>`;
    return;
  }

  const src = parseVideoLink(w.rawUrl || w.vkEmbed || w.videoId || w.directUrl || w.fileId);
  if(!src){
    container.innerHTML = `<div class="video-note">🎬 Видео не подключено — перетащите файл на экран</div>`;
    return;
  }
  if(src.type === 'iframe'){
    const url = autoplay ? src.url : src.url.replace('autoplay=1&','').replace('?autoplay=1','');
    container.innerHTML = `<iframe src="${escapeHtml(url)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  } else if(src.type === 'video'){
    container.innerHTML = `<video src="${escapeHtml(src.url)}" controls ${autoplay ? 'autoplay' : ''} playsinline></video>`;
  } else if(src.type === 'yadisk'){
    container.innerHTML = `<div class="ai-loading"><div class="spinner"></div><span>Загрузка видео с Яндекс.Диска...</span></div>`;
    try{
      const r = await fetch(`https://yandex.net{encodeURIComponent(src.url)}`);
      const d = await r.json();
      if(!d.href) throw new Error();
      container.innerHTML = `<video src="${escapeHtml(d.href)}" controls ${autoplay ? 'autoplay' : ''} playsinline></video>`;
    }catch(e){
      container.innerHTML = `<div class="video-note"><a href="${escapeHtml(src.url)}" target="_blank" class="btn primary">Открыть на Яндекс.Диске ↗</a></div>`;
    }
  }
}

function openPreview(id){
  const w = getWebinars().find(x => x.id === id);
  if(!w) return;
  const body = document.getElementById('previewBody');
  body.innerHTML = '';
  openModal('previewModal');
  mountPlayer(body, w, true);
}

/* ============================================================================
   [3.6] БЕСПЛАТНЫЙ РАЗБОР ВИДЕО В БРАУЗЕРЕ (БЕЗ КЛЮЧЕЙ, БЕЗ VPN И РЕГИСТРАЦИИ)
   ============================================================================ */
let localWhisperPipe = null;

async function transcribeInBrowser(videoFile, onProgress){
  if(!localWhisperPipe){
    onProgress('Загружаем бесплатную нейросеть Whisper в браузер (~45 МБ, один раз)...');
    let mod = null;
    const mirrors = [
      'https://esm.sh',
      'https://unpkg.com'
    ];
    for(const url of mirrors){
      try{
        mod = await import(url);
        if(mod?.pipeline) break;
      }catch(e){}
    }
    if(!mod?.pipeline){
      throw new Error('Не удалось загрузить модуль Whisper (проверьте интернет или откройте сайт вне песочницы CodePen через стрелку ↗).');
    }
    mod.env.allowLocalModels = false;
    localWhisperPipe = await mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      dtype: 'q8',
      device: 'wasm'
    });
  }

  onProgress('Извлекаем звуковую дорожку из видео...');
  const arrayBuf = await videoFile.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuf);
  const targetRate = 16000;
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const audioData = rendered.getChannelData(0);
  await audioCtx.close();

  onProgress('Нейросеть слушает урок и анализирует речь преподавателя (15–40 сек)...');
  const output = await localWhisperPipe(audioData, {
    language: 'russian',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5
  });

  return (output?.text || '').trim();
}


async function runAI(w){
  const btn = document.getElementById('aiBtn');
  const out = document.getElementById('aiResult');
  btn.disabled = true;
  btn.textContent = 'Слушаю видео...';
  const setStatus = msg => { out.innerHTML = `<div class="ai-loading"><div class="spinner"></div><span>${escapeHtml(msg)}</span></div>`; };

  try{
    let transcriptText = (w.transcript || '').trim();

    if(!transcriptText && w.videoType === 'local'){
      const file = await VideoDB.get(w.id);
      if(!file) throw new Error('Видеофайл не найден. Перетащите его на экран заново.');
      transcriptText = await transcribeInBrowser(file, setStatus);

      if(!transcriptText) throw new Error('Не удалось распознать речь — проверьте, есть ли звук в видео.');
      const list = getWebinars();
      const idx = list.findIndex(x => x.id === w.id);
      if(idx >= 0){ list.at(idx).transcript = transcriptText; saveWebinars(list); }
    }

    if(!transcriptText && !w.description){
      throw new Error('Добавьте описание к видео по ссылке, а для перетащенного файла разбор сделается по звуку автоматически.');
    }

    setStatus('Формируем разбор от ИИ и выписываем формулы...');
    const hfKey = getGroqKey();
    let summary = '';
    let formulas = [];

    if(hfKey){
      const promptText = `Ты ассистент студента НГТУ НЭТИ по предмету "${w.subject==='physics'?'Физика':'Математика'}".
Название урока: "${w.title}".
Расшифровка речи из видео:
"""
${transcriptText.slice(0, 24000)}
"""
Составь подробный структурированный разбор урока (5-7 предложений) и выпиши все формулы из этого видео.
Верни строго JSON без markdown:
{"summary":"разбор","formulas":["формула 1","формула 2"]}`;

      const chatResp = await fetch('https://huggingface.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfKey}` },
        body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V3', messages: [{ role: 'user', content: promptText }], max_tokens: 1500 })
      });
      if(chatResp.ok){
        const chatData = await chatResp.json();
        const raw = chatData.choices?.at(0)?.message?.content || '{}';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch.at(0) : raw);
        summary = parsed.summary || '';
        formulas = Array.isArray(parsed.formulas) ? parsed.formulas : [];
      }
    }

    if(!summary){
      const source = transcriptText || w.description || '';
      const sentences = source.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => s.length > 30);
      summary = sentences.slice(0, 6).join(' ') || source.slice(0, 500);
      const found = source.match(/\b([A-Za-zА-Яа-я][A-Za-z0-9²³√]*\s*=\s*[^,.;\n]{1,24})/g) || [];
      formulas = [...new Set(found.map(f => f.trim()))].slice(0, 20);
    }

    const list = getWebinars();
    const idx = list.findIndex(x => x.id === w.id);
    if(idx >= 0){ list.at(idx).aiSummary = summary; list.at(idx).aiFormulas = formulas; saveWebinars(list); }

    render();
  }catch(e){
    out.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    btn.textContent = 'Повторить';
  }finally{
    btn.disabled = false;
  }
}

function renderAIResult(w){
  return `<div class="ai-block"><h4>📋 Разбор от ИИ</h4><p>${escapeHtml(w.aiSummary)||'<span class="muted">—</span>'}</p></div>
    <div class="ai-block"><h4>🧮 Формулы (${(w.aiFormulas||[]).length})</h4>
      ${(w.aiFormulas||[]).length ? `<div class="formulas">${w.aiFormulas.map(f=>`<code>${escapeHtml(f)}</code>`).join('')}</div>` : '<p class="muted">Не найдены</p>'}
    </div>`;
}


/* ============================================================================
   [3.7] ДОБАВЛЕНИЕ, УДАЛЕНИЕ УРОКОВ И ПЕРЕТАСКИВАНИЕ ФАЙЛОВ (DRAG & DROP)
   ============================================================================ */
async function deleteWebinar(id){
  const list = getWebinars();
  const target = list.find(x => x.id === id);
  if(!target) return;
  if(!confirm(`Удалить вебинар «${target.title}»?`)) return;

  await VideoDB.remove(id);
  saveWebinars(list.filter(x => x.id !== id));
  state.page === 'detail' ? go(target.subject || 'home') : render();
}

function setDroppedFile(file){
  if(!file || !file.type.startsWith('video/')){
    alert('Перетащите видеофайл (MP4, WebM, MKV, MOV).');
    return;
  }
  pendingVideoFile = file;
  const zone = document.getElementById('dropZoneLabel');
  if(zone){
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    zone.innerHTML = `✅ Выбран файл: <b>${escapeHtml(file.name)}</b> (${mb} МБ)`;
  }
  const titleInput = document.getElementById('f_title');
  if(titleInput && !titleInput.value.trim()){
    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
  }
}

function openAddModal(subject){
  document.getElementById('f_subject').value = subject || 'physics';
  document.getElementById('f_date').value = new Date().toISOString().slice(0,10);
  ['f_title','f_desc','f_transcript'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f_duration').value = 45;
  document.getElementById('f_source').value = 'local';
  updateSourceFields();
  openModal('addModal');
}

function updateSourceFields(){
  const src = document.getElementById('f_source').value;
  const box = document.getElementById('sourceFields');
  if(src === 'local'){
    const fileInfo = pendingVideoFile
      ? `✅ Выбран файл: <b>${escapeHtml(pendingVideoFile.name)}</b> (${(pendingVideoFile.size/(1024*1024)).toFixed(1)} МБ)`
      : 'Перетащите видеофайл сюда или нажмите, чтобы выбрать с компьютера';
    box.innerHTML = `
      <div class="form-row">
        <label>Видеофайл с компьютера</label>
        <div class="drop-zone" onclick="document.getElementById('f_localFile').click()"
             ondragover="event.preventDefault();this.style.borderColor='var(--primary)'"
             ondragleave="this.style.borderColor='var(--border)'"
             ondrop="event.preventDefault();this.style.borderColor='var(--border)';setDroppedFile(event.dataTransfer.files.item(0))">
          <div style="font-size:28px;margin-bottom:6px">🎬</div>
          <div id="dropZoneLabel" class="small">${fileInfo}</div>
        </div>
        <input type="file" id="f_localFile" accept="video/*" style="display:none" onchange="setDroppedFile(this.files.item(0))">
      </div>`;
  } else {
    box.innerHTML = `<div class="form-row"><label>Ссылка на видео (YouTube, VK, Rutube, Google Drive, Яндекс.Диск)</label><input id="f_rawUrl" placeholder="https://..."></div>`;
  }
}

async function submitAdd(){
  const title = document.getElementById('f_title').value.trim();
  if(!title){ alert('Введите название'); return; }
  const subject = document.getElementById('f_subject').value;
  const date = document.getElementById('f_date').value || new Date().toISOString().slice(0,10);
  const duration = parseInt(document.getElementById('f_duration').value) || 45;
  const description = document.getElementById('f_desc').value.trim();
  const transcript = document.getElementById('f_transcript').value.trim();
  const src = document.getElementById('f_source').value;
  const id = 'w' + Date.now() + Math.random().toString(36).slice(2,6);
  const obj = { id, subject, title, date, duration, description, transcript, videoType:src, aiSummary:'', aiFormulas:[] };

  if(src === 'local'){
    if(!pendingVideoFile){ alert('Перетащите или выберите видеофайл!'); return; }
    await VideoDB.save(id, pendingVideoFile);
    pendingVideoFile = null;
  } else {
    obj.rawUrl = document.getElementById('f_rawUrl').value.trim();
    if(!parseVideoLink(obj.rawUrl)){ alert('Не удалось распознать ссылку на видео'); return; }
  }

  const list = getWebinars();
  list.push(obj);
  saveWebinars(list);
  closeModal('addModal');
  go(subject);
}

(function initGlobalDragDrop(){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(10,14,23,.88);z-index:999;place-items:center;border:3px dashed var(--primary);backdrop-filter:blur(6px);pointer-events:none';
  overlay.innerHTML = '<div style="text-align:center"><div style="font-size:56px;margin-bottom:12px">📥</div><h2>Отпустите видеофайл</h2><p class="muted">Он автоматически добавится на сайт</p></div>';
  document.body.appendChild(overlay);

  let dragCounter = 0;
  window.addEventListener('dragenter', e => {
    if(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')){
      dragCounter++;
      overlay.style.display = 'grid';
    }
  });
  window.addEventListener('dragleave', () => {
    dragCounter--;
    if(dragCounter <= 0){ dragCounter = 0; overlay.style.display = 'none'; }
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault();
    dragCounter = 0;
    overlay.style.display = 'none';
    const file = e.dataTransfer?.files?.item(0);
    if(!file || !file.type.startsWith('video/')) return;

    if(state.page === 'detail' && state.id){
      const list = getWebinars();
      const idx = list.findIndex(x => x.id === state.id);
      if(idx >= 0){
        await VideoDB.save(state.id, file);
        list.at(idx).videoType = 'local';
        saveWebinars(list);
        render();
        return;
      }
    }

    openAddModal(state.subject || 'physics');
    setDroppedFile(file);
  });
})();

/* ============================================================================
   [3.8] НАСТРОЙКИ КЛЮЧЕЙ API, ЭКСПОРТ/ИМПОРТ БАЗЫ И ЗАПУСК
   ============================================================================ */
function getGroqKey(){ try{return (localStorage.getItem(GROQ_KEY_STORAGE)||'').trim();}catch(e){return '';} }
function getDeepSeekKey(){ try{return (localStorage.getItem(DEEPSEEK_KEY_STORAGE)||'').trim();}catch(e){return '';} }

document.getElementById('settingsBtn').addEventListener('click', ()=>{
  document.getElementById('groqKeyInput').value = getGroqKey();
  document.getElementById('deepseekKeyInput').value = getDeepSeekKey();
  openModal('settingsModal');
});

function saveKeys(){
  try{
    const g = document.getElementById('groqKeyInput').value.trim();
    const d = document.getElementById('deepseekKeyInput').value.trim();
    if(g) localStorage.setItem(GROQ_KEY_STORAGE, g); else localStorage.removeItem(GROQ_KEY_STORAGE);
    if(d) localStorage.setItem(DEEPSEEK_KEY_STORAGE, d); else localStorage.removeItem(DEEPSEEK_KEY_STORAGE);
  }catch(e){ alert('Хранилище недоступно'); }
  closeModal('settingsModal');
}

function exportBase(){
  const data = JSON.stringify(getWebinars(), null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neti-webinars-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importBase(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      if(!Array.isArray(imported)) throw new Error();
      const current = getWebinars();
      const ids = new Set(current.map(x => x.id));
      let added = 0;
      imported.forEach(item => {
        if(item && item.id && !ids.has(item.id)){
          current.push(item);
          added++;
        }
      });
      saveWebinars(current);
      closeModal('settingsModal');
      render();
      alert(`Загружено новых уроков: ${added}`);
    }catch(e){
      alert('Неверный формат JSON-файла');
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => {
  if(e.target === m){
    if(m.id === 'previewModal') closePreview();
    else m.classList.remove('open');
  }
}));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    closePreview();
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  }
});

render();
