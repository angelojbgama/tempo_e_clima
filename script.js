// App simples: decide "vai chover" com base em precipitação e probabilidade nas próximas horas
// Fonte: Open‑Meteo Forecast API (sem chave)

const el = (id) => document.getElementById(id);
const statusEl = el('status');
const form = el('search-form');
const queryInput = el('query');
const btnGeoloc = el('btn-geoloc');
const sugList = el('suggestions');

const sectionResult = el('result');
const locationName = el('location-name');
const rainEmoji = el('rain-emoji');
const rainAnswer = el('rain-answer');
const rainDetail = el('rain-detail');
const tempNow = el('temp-now');
const rain6h = el('rain-6h');
const pop24h = el('pop-24h');
const wind = el('wind');
const tz = el('tz');
const hourlyJson = el('hourly-json');

function setStatus(msg) {
  statusEl.textContent = msg || '';
  if (msg) console.log('[status]', msg);
}

function showResult(show) {
  sectionResult.classList.toggle('hidden', !show);
}

// Open-Meteo free geocoding
async function geocode(text) {
  console.log('[ac] geocode query=', text);
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', text);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Falha no geocoding');
  const data = await res.json();
  console.log('[ac] geocode results=', (data.results||[]).length);
  return (data.results || []).map(r => ({
    name: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone || 'auto',
  }));
}

// Fetch forecast from Open‑Meteo
async function getForecast(lat, lon, timezone = 'auto') {
  console.log('[forecast] fetching', { lat, lon, timezone });
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'temperature_2m,precipitation,wind_speed_10m');
  url.searchParams.set('hourly', 'precipitation,precipitation_probability,temperature_2m,wind_speed_10m');
  url.searchParams.set('daily', 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', timezone);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Falha na previsão');
  const json = await res.json();
  console.log('[forecast] success Open-Meteo');
  return json;
}

// Decide: vai chover?
function decideRain(hourly, nowIso) {
  const times = hourly.time;
  const precip = hourly.precipitation || [];
  const prob = hourly.precipitation_probability || [];

  // localizar índice do próximo horário (>= now)
  const now = new Date(nowIso);
  let idx = times.findIndex((t) => new Date(t) >= now);
  if (idx === -1) idx = 0;

  // janela de 6h para acumulado de precipitação e 24h para probabilidade
  const next6 = rangeSlice(precip, idx, idx + 6);
  const next24prob = rangeSlice(prob, idx, idx + 24);

  const sum6 = next6.reduce((a, b) => a + (b || 0), 0);
  const maxProb24 = next24prob.reduce((a, b) => Math.max(a, b || 0), 0);

  // heurística simples
  // - Se acumulado 6h >= 1 mm: prov. chuva
  // - Ou probabilidade máxima >= 50%: chance moderada
  if (sum6 >= 1 || maxProb24 >= 70) {
    console.log('[rain-now]', { sum6, maxProb24, verdict: 'Vai chover' });
    return { verdict: 'Vai chover', emoji: '🌧️', cls: 'bad', sum6, maxProb24 };
  } else if (maxProb24 >= 40 || sum6 > 0) {
    console.log('[rain-now]', { sum6, maxProb24, verdict: 'Pode chover' });
    return { verdict: 'Pode chover', emoji: '🌦️', cls: 'warn', sum6, maxProb24 };
  }
  console.log('[rain-now]', { sum6, maxProb24, verdict: 'Não deve chover' });
  return { verdict: 'Não deve chover', emoji: '🌤️', cls: 'good', sum6, maxProb24 };
}

function rangeSlice(arr, start, end) {
  return arr.slice(Math.max(0, start), Math.max(0, end));
}

function formatWind(ms) {
  // Open‑Meteo retorna km/h para wind_speed_10m em current
  return `${ms?.toFixed ? ms.toFixed(0) : ms} km/h`;
}

async function runForCoords(lat, lon, name) {
  try {
    setStatus('Buscando previsão…');
    console.log('[run] coords', { lat, lon, name });
    const data = await getForecast(lat, lon, 'auto');

    const current = data.current || {};
    const hourly = data.hourly || {};
    window.__lastThemeData = { current, hourly, raw: data };
  const tzName = data.timezone || 'auto';
  const decision = decideRain(hourly, current.time || new Date().toISOString());
  applyTheme(current, hourly, data);

    // UI
    locationName.textContent = name || `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`;
    tz.textContent = tzName;

    rainEmoji.textContent = decision.emoji;
    rainAnswer.textContent = decision.verdict;
    rainAnswer.className = 'headline ' + decision.cls;
    rainDetail.textContent = `Acum. 6h: ${decision.sum6.toFixed(1)} mm • Prob. máx. 24h: ${decision.maxProb24}%`;

    const tNow = current.temperature_2m;
    tempNow.textContent = typeof tNow === 'number' ? `${tNow.toFixed(1)} °C` : '—';
    rain6h.textContent = `${decision.sum6.toFixed(1)} mm`;
    pop24h.textContent = `${decision.maxProb24}%`;
    wind.textContent = formatWind(current.wind_speed_10m);

    // detalhes (resumo das próximas horas)
    const preview = (hourly.time || []).slice(0, 12).map((t, i) => ({
      t,
      precip: hourly.precipitation?.[i],
      pop: hourly.precipitation_probability?.[i],
      temp: hourly.temperature_2m?.[i]
    }));
    hourlyJson.textContent = JSON.stringify(preview, null, 2);

    showResult(true);
    setStatus('');

    // Semana
    const week = computeWeek(data);
    renderWeek(week);
    console.log('[week]', { rainyDays: week.rainyDays, summary: week.summary.verdict });
    // sinalizar que a UI está pronta para o tour
    window.__appReady = true;
    document.dispatchEvent(new Event('app:ready'));
  } catch (err) {
    console.error(err);
    setStatus('Erro: ' + err.message);
  }
}

// Handlers
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = (queryInput.value || '').trim();
  if (!q) {
    setStatus('Digite uma cidade ou use a localização');
    return;
  }
  try {
    setStatus('Buscando coordenadas…');
    const places = await geocode(q);
    if (!places.length) throw new Error('Local não encontrado');
    const place = places[0];
    console.log('[search] using place', place);
    await runForCoords(place.latitude, place.longitude, place.name);
  } catch (err) {
    setStatus('Erro: ' + err.message);
  }
});

btnGeoloc.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocalização não suportada');
    return;
  }
  setStatus('Solicitando localização…');
  btnGeoloc.disabled = true;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    console.log('[geoloc] coords', { latitude, longitude });
    await runForCoords(latitude, longitude);
    btnGeoloc.disabled = false;
  }, (err) => {
    setStatus('Não foi possível obter a localização');
    btnGeoloc.disabled = false;
    console.warn(err);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
});

// Sugestão: iniciar com uma cidade padrão (ex: São Paulo)
window.addEventListener('load', () => {
  runForCoords(-23.55, -46.63, 'São Paulo, BR');
  initBuiltInTour();
});

// === Semana (heurística baseada no seu resumo) ===
const WEEK_MM_THRESHOLD = 2; // mm/dia
const WEEK_POP_THRESHOLD = 60; // % por dia

function computeWeek(api) {
  const d = api.daily || {};
  const dates = d.time || [];
  const pSum = d.precipitation_sum || [];
  const pMax = d.precipitation_probability_max || [];
  const tMax = d.temperature_2m_max || [];
  const tMin = d.temperature_2m_min || [];

  const days = dates.map((date, i) => {
    const mm = pSum[i] ?? 0;
    const pop = pMax[i] ?? null;
    const rainy = (mm >= WEEK_MM_THRESHOLD) || (pop != null && pop >= WEEK_POP_THRESHOLD);

    // “confiança” simples: se pop disponível, usar pop; senão, normalizar mm
    const conf = pop != null ? pop/100 : Math.min(1, mm / 5);

    return {
      date,
      dow: new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
      mm: Number(mm.toFixed ? mm.toFixed(1) : mm),
      pop,
      rainy,
      tmax: tMax[i],
      tmin: tMin[i],
      conf
    };
  });

  const rainyDays = days.filter(d => d.rainy).length;
  const summary = rainyDays === 0 ? { verdict: 'Não deve chover na semana', emoji: '🌤️', cls: 'good' }
    : rainyDays <= 2 ? { verdict: 'Chuva isolada nesta semana', emoji: '🌦️', cls: 'warn' }
    : { verdict: 'Semana chuvosa', emoji: '🌧️', cls: 'bad' };

  return { days, rainyDays, summary };
}

function renderWeek(week) {
  const container = document.getElementById('week-grid');
  const sumEl = document.getElementById('week-summary');
  const themeEl = document.getElementById('week-theme-label');

  sumEl.textContent = `${week.summary.emoji} ${week.summary.verdict} • ${week.rainyDays}/7 dias com chuva`;
  sumEl.className = 'headline ' + week.summary.cls;
  if (themeEl) themeEl.textContent = `Tema: ${labelWeekMood(week)}`;

  container.innerHTML = '';
  week.days.forEach(d => {
    const card = document.createElement('div');
    card.className = 'day-card';
    const emoji = d.rainy ? (d.pop >= 70 || d.mm >= 5 ? '🌧️' : '🌦️') : '🌤️';
    card.innerHTML = `
      <div class="dow">${d.dow}</div>
      <div class="date">${formatDayMonth(d.date)}</div>
      <div class="emoji">${emoji}</div>
      <div class="mm">${d.mm} mm • ${d.pop != null ? d.pop + '%' : '—%'} • ${fmtTemp(d.tmin)}/${fmtTemp(d.tmax)}°C</div>
      <div class="conf"><span style="width:${Math.round(d.conf*100)}%"></span></div>
    `;
    container.appendChild(card);
  });
  // adjust theme for weekly mood (dominant)
  applyWeeklyMood(week);
}

function formatDayMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}

function fmtTemp(v){ return (v==null? '—' : Math.round(v)); }

// === Autocomplete ===
let activeIndex = -1;
let lastQuery = '';
let debounceTimer;

queryInput.addEventListener('input', () => {
  const q = (queryInput.value || '').trim();
  console.log('[ac] input=', q);
  activeIndex = -1;
  if (debounceTimer) clearTimeout(debounceTimer);
  if (q.length < 2) { hideSug(); return; }
  debounceTimer = setTimeout(() => fetchSuggestions(q), 200);
});

queryInput.addEventListener('keydown', (e) => {
  const items = Array.from(sugList.querySelectorAll('li'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!items.length) return;
    activeIndex = (activeIndex + 1) % items.length;
    updateActive(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    updateActive(items);
  } else if (e.key === 'Enter') {
    if (activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      items[activeIndex].click();
    }
  } else if (e.key === 'Escape') {
    hideSug();
  }
});

document.addEventListener('click', (e) => {
  if (!sugList.contains(e.target) && e.target !== queryInput) hideSug();
});

async function fetchSuggestions(q) {
  try {
    if (q === lastQuery) return;
    lastQuery = q;
    const places = await geocode(q);
    renderSuggestions(places);
    console.log('[ac] rendered suggestions=', places.length);
  } catch (e) {
    // silêncio em erro de sugestão
  }
}

function renderSuggestions(places) {
  if (!places.length) { hideSug(); return; }
  sugList.innerHTML = '';
  places.forEach((p, i) => {
    const li = document.createElement('li');
    li.setAttribute('role','option');
    li.innerHTML = `<span>${p.name}</span>`;
    li.addEventListener('click', async () => {
      queryInput.value = p.name;
      hideSug();
      console.log('[ac] select', p);
      await runForCoords(p.latitude, p.longitude, p.name);
    });
    sugList.appendChild(li);
  });
  sugList.classList.remove('hidden');
}

function updateActive(items) {
  items.forEach(el => el.classList.remove('active'));
  if (activeIndex >= 0 && items[activeIndex]) {
    items[activeIndex].classList.add('active');
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }
}

function hideSug() { sugList.classList.add('hidden'); activeIndex = -1; }

// THEME LOGIC
function applyTheme(current, hourly, api){
  const body = document.body;
  // If weekly mood is wet/isolated, let it dominate the body theme and do not override here
  const weekly = window.__weekMood || 'dry';
  if (weekly === 'wet' || weekly === 'isolated') {
    return; // keep weekly background dominant
  }
  body.classList.remove('theme-clear-day','theme-cloudy','theme-rain','theme-rain-heavy','theme-night');
  const now = current?.time ? new Date(current.time) : new Date();
  const hour = now.getHours();
  const isNight = hour < 6 || hour >= 19;

  // Short-term signal
  const precip = hourly?.precipitation || [];
  const prob = hourly?.precipitation_probability || [];
  // next hours window
  let idx = 0;
  if (hourly?.time?.length){
    idx = hourly.time.findIndex(t => new Date(t) >= now);
    if (idx < 0) idx = 0;
  }
  const sum6 = rangeSlice(precip, idx, idx+6).reduce((a,b)=>a+(b||0),0);
  const maxProb24 = rangeSlice(prob, idx, idx+24).reduce((a,b)=>Math.max(a, b||0),0);

  let theme = 'theme-clear-day';
  if (isNight) theme = 'theme-night';
  if (!isNight && maxProb24 >= 20 && maxProb24 < 40 && sum6 === 0) theme = 'theme-cloudy';
  if (maxProb24 >= 40 || sum6 > 0.2) theme = 'theme-rain';
  if (sum6 >= 5 || maxProb24 >= 80) theme = 'theme-rain-heavy';
  body.classList.add(theme);
}

function applyWeeklyMood(week){
  const body = document.body;
  const weekBgClasses = ['week-bg-0','week-bg-1','week-bg-2','week-bg-3'];
  body.classList.remove('theme-week-isolated','theme-week-wet','theme-clear-day','theme-cloudy','theme-rain','theme-rain-heavy','theme-night', ...weekBgClasses);
  if (!week) { window.__weekMood = 'dry'; body.classList.add('week-bg-0'); return; }

  const rainy = week.rainyDays || 0;
  let level = 0;
  if (rainy >= 5) level = 3;
  else if (rainy >= 3) level = 2;
  else if (rainy >= 1) level = 1;
  body.classList.add(`week-bg-${level}`);

  if (rainy >= 3) {
    window.__weekMood = 'wet';
    document.body.classList.add('theme-week-wet');
  } else if (rainy >= 1) {
    window.__weekMood = 'isolated';
    document.body.classList.add('theme-week-isolated');
  } else {
    window.__weekMood = 'dry';
    // allow short-term theme to set background later
    const last = window.__lastThemeData || {};
    applyTheme(last.current, last.hourly, last.raw);
  }
}

function labelWeekMood(week){
  if (!week) return '—';
  if (week.rainyDays >= 3) return 'Semana chuvosa';
  if (week.rainyDays >= 1) return 'Chuva isolada';
  return 'Semana seca';
}

// === Built-in tour (no external lib) ===
function initBuiltInTour(){
  const btn = document.getElementById('btn-tour');
  if (!btn) return;

  // elements
  const overlay = document.createElement('div'); overlay.className = 'tour-overlay';
  const stage = document.createElement('div'); stage.className = 'tour-stage';
  const pop = document.createElement('div'); pop.className = 'tour-popover';
  const popText = document.createElement('div'); popText.className = 'tour-text';
  const actions = document.createElement('div'); actions.className = 'tour-actions';
  const btnPrev = document.createElement('button'); btnPrev.className = 'tour-btn secondary'; btnPrev.textContent = 'Anterior';
  const btnNext = document.createElement('button'); btnNext.className = 'tour-btn'; btnNext.textContent = 'Próximo';
  const btnClose = document.createElement('button'); btnClose.className = 'tour-btn secondary'; btnClose.textContent = 'Fechar';
  actions.append(btnPrev, btnNext, btnClose);
  pop.append(popText, actions);
  document.body.append(overlay, stage, pop);

  function qs(sel){ return document.querySelector(sel); }
  function rect(el){ const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height }; }
  function showEl(el){ el.style.display = 'block'; }
  function hideEl(el){ el.style.display = 'none'; }
  function positionAround(el){
    const { top, left, width, height } = rect(el);
    const pad = 8;
    stage.style.top = `${top - pad}px`;
    stage.style.left = `${left - pad}px`;
    stage.style.width = `${width + pad*2}px`;
    stage.style.height = `${height + pad*2}px`;
    pop.style.top = `${top + height + 12}px`;
    pop.style.left = `${left}px`;
  }

  const makeSteps = () => {
    const steps = [];
    if (qs('.guide-btn')) steps.push({ element: '.guide-btn', text: 'O botão "Guia interativo" fica sempre aqui. Clique novamente quando quiser rever o passo a passo.' });
    if (qs('#query')) steps.push({ element: '#query', text: 'Pesquise uma cidade ou endereço. O autocomplete sugere resultados conforme você digita.' });
    if (qs('#btn-geoloc')) steps.push({ element: '#btn-geoloc', text: 'Prefere rapidez? Use sua localização atual (o navegador vai pedir permissão).' });
    if (qs('#status')) steps.push({ element: '#status', text: 'A linha de status indica carregamento, erros e dicas durante a busca.' });
    if (qs('#result')) steps.push({ element: '#result', text: 'Aqui está a resposta “vai chover?”, além da temperatura, vento e acumulados das próximas horas.' });
    if (qs('details')) steps.push({ element: 'details', text: 'Abra "Ver detalhes horários" para inspecionar o JSON bruto com todos os horários.', onShow: () => { const d = qs('details'); if (d) d.open = true; } });
    if (qs('#week-summary')) steps.push({ element: '#week-summary', text: 'O resumo semanal conta quantos dias têm chuva e entrega o veredito da semana.' });
    if (qs('#week-theme-label')) steps.push({ element: '#week-theme-label', text: 'Este rótulo mostra o tema visual aplicado conforme o clima predominante.' });
    if (qs('#week-grid')) steps.push({ element: '#week-grid', text: 'Cada cartão diário traz emoji de tempo, precipitação, probabilidade e barra de confiança.' });
    if (qs('.footer-surface')) steps.push({ element: '.footer-surface', text: 'No rodapé você encontra links das APIs, dicas rápidas e badges sobre a proposta do app.' });
    return steps.filter(s => !s.element || qs(s.element));
  };

  let steps = [];
  let idx = -1;
  function go(i){
    idx = i;
    if (idx < 0) idx = 0;
    if (idx >= steps.length) { end(); return; }
    const step = steps[idx];
    showEl(overlay); showEl(pop);
    popText.textContent = step.text || '';
    if (!step.element){
      hideEl(stage);
      pop.style.top = `${window.scrollY + 80}px`;
      pop.style.left = `24px`;
    } else {
      showEl(stage);
      const el = qs(step.element);
      if (!el){ next(); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof step.onShow === 'function') step.onShow();
      requestAnimationFrame(() => positionAround(el));
    }
    btnPrev.style.display = idx === 0 ? 'none' : 'inline-block';
    btnNext.textContent = idx === steps.length - 1 ? 'Concluir' : 'Próximo';
  }
  function next(){ go(idx + 1); }
  function prev(){ go(idx - 1); }
  function end(){ hideEl(overlay); hideEl(stage); hideEl(pop); idx = -1; }

  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', () => { if (idx === steps.length - 1) end(); else next(); });
  btnClose.addEventListener('click', end);

  btn.addEventListener('click', () => {
    console.log('[tour] button click (built-in)');
    const start = () => {
      showResult(true);
      steps = makeSteps();
      console.log('[tour] steps built (built-in):', steps.map(s => s.element || '(intro)'));
      if (!steps.length) { alert('Nada para mostrar no guia agora.'); return; }
      go(0);
    };
    if (window.__appReady) start();
    else {
      console.log('[tour] waiting app ready (built-in)');
      const once = () => { document.removeEventListener('app:ready', once); start(); };
      document.addEventListener('app:ready', once);
    }
  });
}

// (funções de tour removidas)
