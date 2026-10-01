// Weather via Open-Meteo (free, no API key).

const WMO = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Fog', '🌫️'],
  51: ['Drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Drizzle', '🌦️'], 61: ['Rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'], 71: ['Snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow', '🌨️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '🌧️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};
export const describeCode = (c) => WMO[c] || ['', '🌡️'];
const rainy = (code, prob) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || (prob ?? 0) >= 50;

export function currentPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location not available'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'Current location' }),
      (e) => rej(new Error(e.message || 'Location denied')),
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&format=json`);
  const d = await r.json();
  return (d.results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

const cache = new Map();
/** Daily forecast for up to 16 days. Returns [{date, tmax, tmin, feelsMax, feelsMin, rainProb, code}] plus current. */
export async function forecast(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit.v;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=16`
    + '&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max';
  const d = await (await fetch(u)).json();
  if (!d.daily) throw new Error('Weather unavailable');
  const days = d.daily.time.map((date, i) => ({
    date, code: d.daily.weather_code[i], tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i],
    feelsMax: d.daily.apparent_temperature_max[i], feelsMin: d.daily.apparent_temperature_min[i], rainProb: d.daily.precipitation_probability_max[i],
  }));
  const v = {
    current: d.current && { temp: d.current.temperature_2m, feelsLike: d.current.apparent_temperature, code: d.current.weather_code, rain: rainy(d.current.weather_code, 0) },
    days,
  };
  cache.set(key, { t: Date.now(), v });
  return v;
}

/** Turn a day into the engine's forecast shape: daytime feel weighted towards the high. */
export function dayToForecast(day) {
  if (!day) return null;
  const feels = day.feelsMin + (day.feelsMax - day.feelsMin) * 0.65;
  const temp = day.tmin + (day.tmax - day.tmin) * 0.65;
  return { temp, feelsLike: feels, rain: rainy(day.code, day.rainProb), code: day.code, tmax: day.tmax, tmin: day.tmin, rainProb: day.rainProb };
}

/** Forecast for a date range: real forecast if within 16 days, otherwise last year's weather as an estimate. */
export async function rangeForecast(lat, lon, start, end) {
  const dates = [];
  for (let d = new Date(start + 'T12:00:00'); d <= new Date(end + 'T12:00:00'); d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
  const f = await forecast(lat, lon).catch(() => ({ days: [] }));
  const known = new Map(f.days.map((x) => [x.date, x]));
  const missing = dates.filter((x) => !known.has(x));
  if (missing.length) {
    const shift = (s) => { const d = new Date(s + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&timezone=auto&start_date=${shift(missing[0])}&end_date=${shift(missing[missing.length - 1])}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum';
    try {
      const d = await (await fetch(u)).json();
      d.daily?.time.forEach((t, i) => {
        const dt = new Date(t + 'T12:00:00'); dt.setFullYear(dt.getFullYear() + 1);
        known.set(dt.toISOString().slice(0, 10), {
          date: t, estimated: true, code: d.daily.weather_code[i], tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i],
          feelsMax: d.daily.apparent_temperature_max[i], feelsMin: d.daily.apparent_temperature_min[i], rainProb: d.daily.precipitation_sum[i] > 1 ? 60 : 10,
        });
      });
    } catch {}
  }
  return dates.map((date) => ({ date, day: known.get(date) || null }));
}

export const fmtTemp = (c, units = 'C') => (c == null ? '–' : units === 'F' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`);
