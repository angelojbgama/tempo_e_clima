// App simples: decide "vai chover" com base em precipitação e probabilidade nas próximas horas
// Fonte: Open‑Meteo Forecast API (sem chave)

const el = (id) => document.getElementById(id);
const form = el('search-form');
const queryInput = el('query');
const btnGeoloc = el('btn-geoloc');
const sugList = el('suggestions');

const sectionResult = el('result');
const locationName = el('location-name');
const rainEmoji = el('rain-emoji');
const rainAnswer = el('rain-answer');
const tempNow = el('temp-now');
const rain6h = el('rain-6h');
const pop24h = el('pop-24h');
const wind = el('wind');
const humidity = el('humidity');
const uv = el('uv');
const aqi = el('aqi');
const sunrise = el('sunrise');
const sunset = el('sunset');
const tempLabel = el('temp-label');
const rain6hLabel = el('rain-6h-label');
const pop24hLabel = el('pop-24h-label');
const windLabel = el('wind-label');
const humidityLabel = el('humidity-label');
const uvLabel = el('uv-label');
const aqiLabel = el('aqi-label');
const tz = el('tz');
const btnNow = el('btn-now');
const unitButtons = Array.from(document.querySelectorAll('.unit-btn'));
const TEMP_UNITS = {
  C: { label: '°C', name: 'Celsius' },
  F: { label: '°F', name: 'Fahrenheit' },
  K: { label: 'K', name: 'Kelvin' }
};
let tempUnit = 'C';
try {
  const storedUnit = localStorage.getItem('temp-unit');
  if (TEMP_UNITS[storedUnit]) tempUnit = storedUnit;
} catch (err) {
  // ignore storage errors
}
let lastSuccessfulPlace = null;

let toastTimer;
function setStatus(msg) {
  const toast = el('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);

  toast.textContent = msg || '';
  if (msg) {
    console.log('[status]', msg);
    toast.classList.add('show');
    // Automatically hide after a delay, unless it's a persistent "loading" message
    if (!msg.includes('Buscando') && !msg.includes('Solicitando')) {
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 4000); // Hide after 4 seconds
    }
  } else {
    toast.classList.remove('show');
  }
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
  url.searchParams.set('current', 'temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m');
  url.searchParams.set('hourly', 'precipitation,precipitation_probability,temperature_2m,wind_speed_10m,relative_humidity_2m,uv_index');
  url.searchParams.set('daily', 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,sunrise,sunset');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', timezone);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Falha na previsão');
  const json = await res.json();
  console.log('[forecast] success Open-Meteo');
  return json;
}

async function getAirQuality(lat, lon, timezone = 'auto') {
  console.log('[air] fetching', { lat, lon, timezone });
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'us_aqi');
  url.searchParams.set('timezone', timezone);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Falha na qualidade do ar');
  const json = await res.json();
  console.log('[air] success Open-Meteo');
  return json;
}

// Decide: vai chover?
const ALGORITHM_CONFIG = {
  v2: {
    name: 'Sistema de Pontos',
    rules: {
      prob24h_40: { points: 2, desc: 'Prob. de chuva ≥ 40% nas próx. 24h' },
      prob24h_70: { points: 2, desc: 'Prob. de chuva ≥ 70% nas próx. 24h' },
      sum6h_0_5: { points: 2, desc: 'Chuva acumulada ≥ 0.5mm nas próx. 6h' },
      sum6h_2_0: { points: 2, desc: 'Chuva acumulada ≥ 2.0mm nas próx. 6h' },
      maxPrecip6h_1_0: { points: 2, desc: 'Pico de chuva ≥ 1.0mm/h nas próx. 6h' },
      probDaytime_50: { points: 2, desc: 'Prob. de chuva ≥ 50% durante o dia' },
    },
    verdicts: {
      willRain: { score: 6, text: 'Vai chover' },
      mayRain: { score: 3, text: 'Pode chover' },
      noRain: { score: 0, text: 'Não deve chover' },
    }
  }
};

const SUMMARY_LABELS = {
  now: {
    temp: 'Temp. agora:',
    rain6h: 'Chuva nas próximas 6h:',
    pop24h: 'Prob. de chuva (próx. 24h):',
    wind: 'Vento:',
    humidity: 'Umidade agora:',
    uv: 'Índice UV agora:'
  },
  day: {
    temp: 'Temp. do dia (min/max):',
    rain6h: 'Pico de chuva (6h):',
    pop24h: 'Prob. de chuva (dia):',
    wind: 'Vento (máx. dia):',
    humidity: 'Umidade (min/max dia):',
    uv: 'Índice UV (min/max dia):'
  }
};

function setSummaryLabels(mode) {
  const labels = SUMMARY_LABELS[mode] || SUMMARY_LABELS.now;
  if (tempLabel) tempLabel.textContent = labels.temp;
  if (rain6hLabel) rain6hLabel.textContent = labels.rain6h;
  if (pop24hLabel) pop24hLabel.textContent = labels.pop24h;
  if (windLabel) windLabel.textContent = labels.wind;
  if (humidityLabel) humidityLabel.textContent = labels.humidity;
  if (uvLabel) uvLabel.textContent = labels.uv;
  if (aqiLabel && !aqiLabel.textContent) aqiLabel.textContent = 'IQA (US):';
}

function applyDecisionToUI(decision) {
  if (!decision) return;
  rainEmoji.textContent = decision.emoji;
  rainAnswer.textContent = decision.verdict;
  rainAnswer.className = 'headline ' + decision.cls;
  rain6h.textContent = `${decision.sum6.toFixed(1)} mm`;
  pop24h.textContent = `${Math.round(decision.maxProb24)}%`;
}

function buildDecision(metrics) {
  const cfg = ALGORITHM_CONFIG.v2.rules;
  const sum6 = metrics.sum6 || 0;
  const maxProb24 = metrics.maxProb24 || 0;
  const maxPrecip6 = metrics.maxPrecip6 || 0;
  const maxProbDaytime = metrics.maxProbDaytime || 0;

  let score = 0;
  if (maxProb24 >= 40) score += cfg.prob24h_40.points;
  if (maxProb24 >= 70) score += cfg.prob24h_70.points;
  if (sum6 >= 0.5) score += cfg.sum6h_0_5.points;
  if (sum6 >= 2.0) score += cfg.sum6h_2_0.points;
  if (maxPrecip6 >= 1.0) score += cfg.maxPrecip6h_1_0.points;
  if (maxProbDaytime >= 50) score += cfg.probDaytime_50.points;

  const verdicts = ALGORITHM_CONFIG.v2.verdicts;
  if (score >= verdicts.willRain.score) {
    return { verdict: verdicts.willRain.text, emoji: '🌧️', cls: 'bad', sum6, maxProb24, maxPrecip6, maxProbDaytime, score };
  }
  if (score >= verdicts.mayRain.score) {
    return { verdict: verdicts.mayRain.text, emoji: '🌦️', cls: 'warn', sum6, maxProb24, maxPrecip6, maxProbDaytime, score };
  }
  return { verdict: verdicts.noRain.text, emoji: '🌤️', cls: 'good', sum6, maxProb24, maxPrecip6, maxProbDaytime, score };
}

function decideRain(hourly, nowIso) {
  const times = hourly.time.map(t => new Date(t));
  const precip = hourly.precipitation || [];
  const prob = hourly.precipitation_probability || [];

  const now = new Date(nowIso);
  let currentHourIdx = times.findIndex((t) => t >= now);
  if (currentHourIdx === -1) currentHourIdx = 0;

  const sum6 = rangeSlice(precip, currentHourIdx, currentHourIdx + 6).reduce((a, b) => a + (b || 0), 0);
  const maxProb24 = rangeSlice(prob, currentHourIdx, currentHourIdx + 24).reduce((a, b) => Math.max(a, b || 0), 0);
  const maxPrecip6 = rangeSlice(precip, currentHourIdx, currentHourIdx + 6).reduce((a, b) => Math.max(a, b || 0), 0);

  // Find max probability during daytime hours (7am to 7pm)
  let maxProbDaytime = 0;
  for (let i = 0; i < 24 && (currentHourIdx + i) < times.length; i++) {
    const hour = times[currentHourIdx + i].getHours();
    if (hour >= 7 && hour < 19) {
      maxProbDaytime = Math.max(maxProbDaytime, prob[currentHourIdx + i] || 0);
    }
  }

  const decision = buildDecision({ sum6, maxProb24, maxPrecip6, maxProbDaytime });
  console.log('[rain-score]', { score: decision.score, maxProb24, sum6, maxPrecip6, maxProbDaytime });
  return decision;
}

function rangeSlice(arr, start, end) {
  return arr.slice(Math.max(0, start), Math.max(0, end));
}

function formatWind(ms) {
  // Open‑Meteo retorna km/h para wind_speed_10m em current
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '—';
  return `${ms.toFixed(0)} km/h`;
}

function convertTemp(value, unit) {
  if (!Number.isFinite(value)) return null;
  if (unit === 'F') return (value * 9) / 5 + 32;
  if (unit === 'K') return value + 273.15;
  return value;
}

function formatTempNumber(value, decimals = 1) {
  const converted = convertTemp(value, tempUnit);
  if (converted == null) return '—';
  return converted.toFixed(decimals);
}

function formatTempValue(value, decimals = 1) {
  const num = formatTempNumber(value, decimals);
  if (num === '—') return '—';
  return `${num} ${TEMP_UNITS[tempUnit].label}`;
}

function formatTempRange(min, max, decimals = 1) {
  const minStr = formatTempNumber(min, decimals);
  const maxStr = formatTempNumber(max, decimals);
  if (minStr === '—' || maxStr === '—') return '—';
  return `${minStr} / ${maxStr} ${TEMP_UNITS[tempUnit].label}`;
}


function formatTempRangeCompact(min, max) {
  const minStr = formatTempNumber(min, 0);
  const maxStr = formatTempNumber(max, 0);
  if (minStr === '—' || maxStr === '—') return '—';
  return `${minStr}/${maxStr}${TEMP_UNITS[tempUnit].label}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

function formatUV(value) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(1);
}

function formatAQI(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toString();
}

function formatRange(minValue, maxValue, formatter) {
  const hasMin = Number.isFinite(minValue);
  const hasMax = Number.isFinite(maxValue);
  if (!hasMin && !hasMax) return '—';
  const minStr = hasMin ? formatter(minValue) : '—';
  const maxStr = hasMax ? formatter(maxValue) : '—';
  return `${minStr} / ${maxStr}`;
}

function classifyAqi(value) {
  if (!Number.isFinite(value)) return null;
  if (value <= 50) return { label: 'Bom', cls: 'good' };
  if (value <= 100) return { label: 'Moderado', cls: 'warn' };
  return { label: 'Ruim', cls: 'bad' };
}

function setHumidityUVText(humidityText, uvText) {
  if (humidity) humidity.textContent = humidityText;
  if (uv) uv.textContent = uvText;
}

function applyAirQuality(air) {
  const value = air?.current?.us_aqi;
  if (!aqi) return;
  aqi.classList.remove('good', 'warn', 'bad');
  if (!Number.isFinite(value)) {
    aqi.textContent = '—';
    return;
  }
  const category = classifyAqi(value);
  const valueText = formatAQI(value);
  if (category) {
    aqi.textContent = `${valueText} • ${category.label}`;
    aqi.classList.add(category.cls);
  } else {
    aqi.textContent = valueText;
  }
  if (aqiLabel) aqiLabel.textContent = 'IQA (US):';
}

function getCurrentHourIndex(hourly, nowIso) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) return -1;
  const now = new Date(nowIso);
  let idx = hourly.time.findIndex((t) => new Date(t) >= now);
  if (idx === -1) idx = 0;
  return idx;
}

function formatSunTime(timeStr) {
  if (!timeStr) return '—';
  if (typeof timeStr === 'string') {
    const match = timeStr.match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
    const plain = timeStr.match(/^\d{2}:\d{2}/);
    if (plain) return plain[0];
  }
  const d = new Date(timeStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function setSunTimes(sunriseStr, sunsetStr) {
  if (sunrise) sunrise.textContent = formatSunTime(sunriseStr);
  if (sunset) sunset.textContent = formatSunTime(sunsetStr);
}

function setTempUnit(unit, { persist = true } = {}) {
  if (!TEMP_UNITS[unit]) return;
  tempUnit = unit;
  unitButtons.forEach((btn) => {
    const active = btn.dataset.unit === unit;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (persist) {
    try {
      localStorage.setItem('temp-unit', unit);
    } catch (err) {
      // ignore storage errors
    }
  }
  updateTemperatureUI();
}

function updateWeekTemps(week) {
  const container = el('week-grid');
  if (!container || !week) return;
  const cards = Array.from(container.children);
  week.days.forEach((d, i) => {
    const card = cards[i];
    if (!card) return;
    const tempEl = card.querySelector('.temp-range');
    if (tempEl) tempEl.textContent = formatTempRangeCompact(d.tmin, d.tmax);
  });
}

function updateTemperatureUI() {
  const data = window.__lastThemeData?.raw;
  if (!data) return;
  const current = data.current || {};
  const hourly = data.hourly || {};

  if (window.__selectedDate) {
    const summary = computeDaySummary(hourly, window.__selectedDate, data.daily);
    if (summary) {
      tempNow.textContent = formatTempRange(summary.tMin, summary.tMax);
    } else {
      tempNow.textContent = formatTempValue(current.temperature_2m);
    }
  } else {
    tempNow.textContent = formatTempValue(current.temperature_2m);
  }

  if (window.__lastWeek) updateWeekTemps(window.__lastWeek);
}

function initTempUnitToggle() {
  if (!unitButtons.length) return;
  unitButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTempUnit(btn.dataset.unit));
  });
  setTempUnit(tempUnit, { persist: false });
}

function clearActiveDayCards() {
  const container = el('week-grid');
  if (!container) return;
  Array.from(container.children).forEach(child => {
    child.classList.remove('is-active');
    child.setAttribute('aria-pressed', 'false');
  });
}

function renderNowView(data, air) {
  const current = data.current || {};
  const hourly = data.hourly || {};
  const daily = data.daily || {};
  const nowIso = current.time || new Date().toISOString();
  const decision = decideRain(hourly, nowIso);

  window.__selectedDate = null;
  setSummaryLabels('now');
  applyDecisionToUI(decision);

  tempNow.textContent = formatTempValue(current.temperature_2m);
  wind.textContent = formatWind(current.wind_speed_10m);

  const nowIdx = getCurrentHourIndex(hourly, nowIso);
  const humidityNow = typeof current.relative_humidity_2m === 'number'
    ? current.relative_humidity_2m
    : (nowIdx >= 0 ? hourly.relative_humidity_2m?.[nowIdx] : null);
  const uvNow = nowIdx >= 0 ? hourly.uv_index?.[nowIdx] : null;
  setHumidityUVText(formatPercent(humidityNow), formatUV(uvNow));

  const todayKey = nowIso.slice(0, 10);
  const todayIdx = Array.isArray(daily.time) ? daily.time.indexOf(todayKey) : -1;
  setSunTimes(todayIdx >= 0 ? daily.sunrise?.[todayIdx] : null, todayIdx >= 0 ? daily.sunset?.[todayIdx] : null);

  applyAirQuality(air);
  renderHourlyForecast(hourly, nowIso);
  clearActiveDayCards();
  setNowButtonState(true);
}

function setNowButtonState(active) {
  if (!btnNow) return;
  btnNow.classList.toggle('is-active', active);
  btnNow.setAttribute('aria-pressed', active ? 'true' : 'false');
}

if (btnNow) {
  btnNow.addEventListener('click', () => {
    const data = window.__lastThemeData?.raw;
    if (!data) return;
    renderNowView(data, window.__lastAirQuality);
  });
}

function safeMax(values) {
  let max = null;
  values.forEach((v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      max = max === null ? v : Math.max(max, v);
    }
  });
  return max;
}

function safeMin(values) {
  let min = null;
  values.forEach((v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      min = min === null ? v : Math.min(min, v);
    }
  });
  return min;
}

function computeMaxWindowSum(values, windowSize) {
  if (!values.length) return 0;
  if (values.length <= windowSize) {
    return values.reduce((a, b) => a + (b || 0), 0);
  }
  let max = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] || 0;
    if (i >= windowSize) sum -= values[i - windowSize] || 0;
    if (i >= windowSize - 1) max = Math.max(max, sum);
  }
  return max;
}

function computeMaxDaytimeProb(probs, times) {
  let max = 0;
  for (let i = 0; i < times.length; i++) {
    const hour = times[i].getHours();
    if (hour >= 7 && hour < 19) {
      max = Math.max(max, probs[i] || 0);
    }
  }
  return max;
}

function resolveSunWindow(source, date) {
  if (!source) return null;
  const isString = (v) => typeof v === 'string' && v.length;
  if (isString(source.sunrise) || isString(source.sunset)) {
    return { sunrise: source.sunrise, sunset: source.sunset };
  }
  if (Array.isArray(source.time) || Array.isArray(source.sunrise)) {
    const times = source.time || [];
    const idx = times.indexOf(date);
    if (idx < 0) return null;
    return { sunrise: source.sunrise?.[idx], sunset: source.sunset?.[idx] };
  }
  return null;
}

function computeMinMaxWithinWindow(values, times, start, end) {
  let min = null;
  let max = null;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t >= start && t <= end) {
      const v = values[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        min = min === null ? v : Math.min(min, v);
        max = max === null ? v : Math.max(max, v);
      }
    }
  }
  return { min, max };
}

function getHourlyRangeForDate(hourly, date) {
  if (!hourly || !Array.isArray(hourly.time)) return null;
  const datePrefix = `${date}T`;
  const startIdx = hourly.time.findIndex(t => t.startsWith(datePrefix));
  if (startIdx === -1) return null;
  let endIdx = startIdx;
  while (endIdx < hourly.time.length && hourly.time[endIdx].startsWith(datePrefix)) {
    endIdx++;
  }
  return { startIdx, endIdx };
}

function computeDaySummary(hourly, date, sunData) {
  const range = getHourlyRangeForDate(hourly, date);
  if (!range) return null;

  const { startIdx, endIdx } = range;
  const times = hourly.time.map(t => new Date(t)).slice(startIdx, endIdx);
  const precip = (hourly.precipitation || []).slice(startIdx, endIdx);
  const prob = (hourly.precipitation_probability || []).slice(startIdx, endIdx);
  const temps = (hourly.temperature_2m || []).slice(startIdx, endIdx);
  const winds = (hourly.wind_speed_10m || []).slice(startIdx, endIdx);
  const hums = (hourly.relative_humidity_2m || []).slice(startIdx, endIdx);
  const uvs = (hourly.uv_index || []).slice(startIdx, endIdx);

  const sum6 = computeMaxWindowSum(precip, 6);
  const maxProb24 = safeMax(prob) ?? 0;
  const maxPrecip6 = safeMax(precip) ?? 0;
  const maxProbDaytime = computeMaxDaytimeProb(prob, times);

  const decision = buildDecision({ sum6, maxProb24, maxPrecip6, maxProbDaytime });
  const tMin = safeMin(temps);
  const tMax = safeMax(temps);
  const windMax = safeMax(winds);
  const humidityMin = safeMin(hums);
  const humidityMax = safeMax(hums);
  const sunWindow = resolveSunWindow(sunData, date);
  let uvMin = null;
  let uvMax = null;
  if (sunWindow?.sunrise && sunWindow?.sunset) {
    const start = new Date(sunWindow.sunrise);
    const end = new Date(sunWindow.sunset);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      const within = computeMinMaxWithinWindow(uvs, times, start, end);
      uvMin = within.min;
      uvMax = within.max;
    }
  }

  return { decision, tMin, tMax, windMax, humidityMin, humidityMax, uvMin, uvMax };
}

async function runForCoords(lat, lon, name) {
  // Cache the last successful place for refresh functionality
  if (name) lastSuccessfulPlace = { latitude: lat, longitude: lon, name: name };

  try {
    setStatus('Buscando previsão…');
    console.log('[run] coords', { lat, lon, name });
    const [data, air] = await Promise.all([
      getForecast(lat, lon, 'auto'),
      getAirQuality(lat, lon, 'auto').catch((err) => {
        console.warn(err);
        return null;
      })
    ]);

    const current = data.current || {};
    const hourly = data.hourly || {};
    window.__lastAirQuality = air;
    window.__lastThemeData = { current, hourly, raw: data };
    const tzName = data.timezone || 'auto';
    const nowIso = current.time || new Date().toISOString();
    applyTheme(current, hourly, data);

    // UI
    locationName.textContent = name || `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`;
    tz.textContent = tzName;

    renderNowView(data, air);



    showResult(true);
    setStatus('');

    // Horas e Semana
    const week = computeWeek(data);
    window.__lastWeek = week;
    renderWeek(week, hourly, nowIso);
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

  // If the query is the same as the last successful search, just re-run it with stored coords.
  if (lastSuccessfulPlace && q === lastSuccessfulPlace.name) {
    console.log('[search] re-running for last successful place');
    await runForCoords(lastSuccessfulPlace.latitude, lastSuccessfulPlace.longitude, lastSuccessfulPlace.name);
    return;
  }

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

async function reverseGeocode(lat, lon) {
  console.log('[reverse-geocode] fetching for', { lat, lon });
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Falha no geocoding reverso');
  const data = await res.json();
  console.log('[reverse-geocode] result', data);
  if (data.error) throw new Error(data.error);
  const address = data.address;
  const name = address.city || address.town || address.village || address.hamlet || 'Localização atual';
  return { name, country: address.country };
}

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
    try {
      setStatus('Buscando nome do local…');
      const place = await reverseGeocode(latitude, longitude);
      const displayName = `${place.name}, ${place.country}`;
      await runForCoords(latitude, longitude, displayName);
    } catch (err) {
      console.error('Erro no reverse geocoding, usando coordenadas', err);
      // Fallback to coordinates if reverse geocoding fails
      await runForCoords(latitude, longitude);
    } finally {
      btnGeoloc.disabled = false;
    }
  }, (err) => {
    setStatus('Não foi possível obter a localização');
    btnGeoloc.disabled = false;
    console.warn(err);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
});

// Sugestão: iniciar com uma cidade padrão (ex: São Paulo)
window.addEventListener('load', () => {
  initTempUnitToggle();
  runForCoords(-23.55, -46.63, 'São Paulo, BR');
  initBuiltInTour();
  renderAlgorithmExplanation();
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
  const sunrises = d.sunrise || [];
  const sunsets = d.sunset || [];

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
      conf,
      sunrise: sunrises[i],
      sunset: sunsets[i]
    };
  });

  const rainyDays = days.filter(d => d.rainy).length;
  const summary = rainyDays === 0 ? { verdict: 'Não deve chover na semana', emoji: '🌤️', cls: 'good' }
    : rainyDays <= 2 ? { verdict: 'Chuva isolada nesta semana', emoji: '🌦️', cls: 'warn' }
    : { verdict: 'Semana chuvosa', emoji: '🌧️', cls: 'bad' };

  return { days, rainyDays, summary };
}

function renderWeek(week, hourly, nowIso) {
  const container = document.getElementById('week-grid');
  const sumEl = document.getElementById('week-summary');
  const themeEl = document.getElementById('week-theme-label');

  sumEl.textContent = `${week.summary.emoji} ${week.summary.verdict} • ${week.rainyDays}/7 dias com chuva`;
  sumEl.className = 'headline ' + week.summary.cls;
  if (themeEl) themeEl.textContent = `Tema: ${labelWeekMood(week)}`;

  const setActiveCard = (card) => {
    Array.from(container.children).forEach(child => {
      const isActive = child === card;
      child.classList.toggle('is-active', isActive);
      child.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  container.innerHTML = '';
  week.days.forEach(d => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', 'false');

    const label = `${d.dow}, ${formatDayMonth(d.date)}`;
    card.setAttribute('aria-label', `Ver previsão horária de ${label}`);

    const daySummary = computeDaySummary(hourly, d.date, { sunrise: d.sunrise, sunset: d.sunset });
    const emoji = daySummary?.decision?.emoji
      ? daySummary.decision.emoji
      : d.rainy ? (d.pop >= 70 || d.mm >= 5 ? '🌧️' : '🌦️') : '🌤️';
    const humidityText = formatRange(daySummary?.humidityMin, daySummary?.humidityMax, formatPercent);
    const uvText = formatRange(daySummary?.uvMin, daySummary?.uvMax, formatUV);
    const indicator = d.pop >= 75
      ? '<div class="rain-indicator" data-tooltip="Alta chance de chuva no dia (>= 75%)" aria-label="Alta chance de chuva no dia (>= 75%)" role="img"></div>'
      : '';
    card.innerHTML = `
      ${indicator}
      <div class="dow">${d.dow}</div>
      <div class="date">${formatDayMonth(d.date)}</div>
      <div class="emoji">${emoji}</div>
      <div class="mm">${d.mm} mm • ${d.pop != null ? d.pop + '%' : '—%'}</div>
      <div class="temp-range">${formatTempRangeCompact(d.tmin, d.tmax)}</div>
      <div class="day-extras">
        <div>💧 ${humidityText}</div>
        <div>☀️ UV ${uvText}</div>
      </div>
      <div class="sun-times">
        <div>🌅 ${formatSunTime(d.sunrise)}</div>
        <div>🌇 ${formatSunTime(d.sunset)}</div>
      </div>
      <div class="conf"><span style="width:${Math.round(d.conf*100)}%"></span></div>
    `;

    const activate = () => {
      window.__selectedDate = d.date;
      const summary = daySummary || computeDaySummary(hourly, d.date, { sunrise: d.sunrise, sunset: d.sunset });
      if (summary) {
        setSummaryLabels('day');
        applyDecisionToUI(summary.decision);
        tempNow.textContent = formatTempRange(summary.tMin, summary.tMax);
        wind.textContent = formatWind(summary.windMax);
        const dayHumidity = formatRange(summary.humidityMin, summary.humidityMax, formatPercent);
        const dayUv = formatRange(summary.uvMin, summary.uvMax, formatUV);
        setHumidityUVText(dayHumidity, dayUv);
      }
      setSunTimes(d.sunrise, d.sunset);
      setNowButtonState(false);
      renderHourlyForecast(hourly, nowIso, { date: d.date, title: `Previsão horária — ${label}` });
      setActiveCard(card);
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });

    container.appendChild(card);
  });
  // adjust theme for weekly mood (dominant)
  applyWeeklyMood(week);
}

function formatDayMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}


function renderHourlyForecast(hourly, nowIso, opts = {}) {
  const container = el('hourly-ruler-content');
  if (!container) return;

  const titleEl = el('hourly-ruler-title');
  const defaultTitle = 'Previsão para as próximas 24h';
  if (titleEl) titleEl.textContent = opts.title || defaultTitle;

  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) {
    container.innerHTML = '';
    return;
  }

  const times = hourly.time.map(t => new Date(t));
  const probs = hourly.precipitation_probability || [];

  let startIdx = 0;
  let endIdx = 0;

  if (opts.date) {
    const range = getHourlyRangeForDate(hourly, opts.date);
    if (!range) {
      container.innerHTML = '<div class="muted tiny">Sem dados horários para este dia.</div>';
      return;
    }
    startIdx = range.startIdx;
    endIdx = range.endIdx;
  } else {
    const now = new Date(nowIso);
    startIdx = times.findIndex((t) => t >= now);
    if (startIdx === -1) {
      container.innerHTML = '';
      return;
    }
    endIdx = Math.min(startIdx + 24, times.length);
  }

  let html = '';
  for (let i = startIdx; i < endIdx; i++) {
    const hour = times[i].getHours();
    const pop = probs[i] || 0;

    html += `
      <div class="hour-col" title="${pop}% de chance de chuva às ${hour}h">
        <div class="hour-pop">${pop > 0 ? pop + '%' : ''}</div>
        <div class="hour-bar-wrapper">
          <div class="hour-bar" style="height: ${pop}%"></div>
        </div>
        <div class="hour-label">${hour}h</div>
      </div>
    `;
  }
  container.innerHTML = html;
  container.scrollLeft = 0;
}

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

function renderAlgorithmExplanation() {
  const container = el('algorithm-explanation');
  if (!container) return;

  const cfg = ALGORITHM_CONFIG.v2;

  const rulesHtml = Object.values(cfg.rules).map(rule => 
    `<li><strong>+${rule.points} pontos:</strong> ${rule.desc}</li>`
  ).join('');

  container.innerHTML = `
    <h3 class="footer-title-small">Algoritmo de Decisão (${cfg.name})</h3>
    <p class="footer-text-small">
      A decisão é baseada em um sistema de pontos que avalia vários fatores. A pontuação final determina o resultado:
    </p>
    <ul class="footer-list-small">
      ${rulesHtml}
    </ul>
    <p class="footer-text-small" style="margin-top: 12px;">
      <strong>Resultado:</strong> A previsão será "${cfg.verdicts.willRain.text}" com ${cfg.verdicts.willRain.score} ou mais pontos, e "${cfg.verdicts.mayRain.text}" com ${cfg.verdicts.mayRain.score} ou mais pontos.
    </p>
  `;
}
