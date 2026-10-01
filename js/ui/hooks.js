import { useEffect, useState } from '../lib/deps.js';
import { forecast, currentPosition, dayToForecast } from '../lib/weather.js';
import { settings, saveSettings, getState } from '../lib/store.js';
import { seasonFor } from '../styling/taxonomy.js';

/** Location (saved city or GPS) + forecast. Shared by Style, Stylist and Plan. */
let shared = null;
export function useWeather() {
  const [s, set] = useState(shared || { loading: true, location: null, data: null, error: null });
  useEffect(() => {
    if (shared && !shared.error && Date.now() - shared.t < 20 * 60 * 1000) return;
    (async () => {
      try {
        let loc = settings().location;
        if (!loc) {
          loc = await currentPosition();
          saveSettings({ location: { ...loc, name: 'My location' } }).catch(() => {});
        }
        const data = await forecast(loc.lat, loc.lon);
        shared = { loading: false, location: loc, data, error: null, t: Date.now() };
        set(shared);
      } catch (e) {
        shared = { loading: false, location: null, data: null, error: e.message || String(e), t: Date.now() };
        set(shared);
      }
    })();
  }, []);
  return s;
}

/** Engine forecast for a given date string (YYYY-MM-DD) or today (current conditions blended with the day). */
export function forecastFor(weather, date) {
  if (!weather?.data) return null;
  const day = weather.data.days.find((d) => d.date === date) || (date ? null : weather.data.days[0]);
  if (!date && weather.data.current) {
    const f = dayToForecast(weather.data.days[0]);
    return { ...f, current: weather.data.current.temp, rain: f.rain || weather.data.current.rain };
  }
  return dayToForecast(day);
}

/** Base engine context from the user's profile + settings. */
export function baseContext(overrides = {}) {
  const st = getState();
  const s = settings();
  return {
    occasion: s.occasion || 'casual',
    styleProfile: st.profile?.style_profile || [],
    season: seasonFor(new Date(), s.location?.lat ?? 60),
    today: Date.now(),
    weather: { mode: s.weatherMode, dayProfile: s.dayProfile, indoorTemp: s.indoorTemp },
    ...overrides,
  };
}
