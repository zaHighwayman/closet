import { html, useState } from '../lib/deps.js';
import { useStore, saveProfile, settings, saveSettings, exportData, deleteAccount, me, tasteEvents, tasteSummary } from '../lib/store.js';
import { auth, isLocal, uploadImage } from '../lib/db.js';
import { localGroqKey } from '../lib/ai.js';
import { geocode, currentPosition } from '../lib/weather.js';
import { prepare } from '../lib/images.js';
import { STYLE_TAGS } from '../styling/taxonomy.js';
import { Header, Chips, Toggle, Segmented, toast, confirmAsk } from '../ui/components.js';
import { Avatar } from './social.js';

export function SettingsView() {
  const { profile } = useStore();
  const s = settings();
  const [p, setP] = useState({ username: profile.username, display_name: profile.display_name || '', bio: profile.bio || '' });
  const [city, setCity] = useState('');
  const [cities, setCities] = useState([]);
  const [key, setKey] = useState(localGroqKey.get());
  const [pw, setPw] = useState('');

  const saveS = (patch) => saveSettings(patch).then(() => toast('Saved')).catch((e) => toast(e, 'error'));

  async function saveP() {
    try { await saveProfile({ ...p, username: p.username.toLowerCase().trim() }); toast('Profile saved'); }
    catch (e) { toast(/username/.test(e.message) ? 'Username must be 3–24 characters: a–z, 0–9, _ or . (and not taken)' : e, 'error'); }
  }
  async function avatar(f) {
    if (!f) return;
    try { const url = await uploadImage(await prepare(f, 400), me()); await saveProfile({ avatar_url: url }); toast('Photo updated'); } catch (e) { toast(e, 'error'); }
  }
  async function exportJson() {
    const blob = new Blob([JSON.stringify(await exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `closet-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }

  return html`
    <${Header} title="Settings" backTo="" />
    <section class="card form">
      <h3>Profile</h3>
      <div class="row gap"><${Avatar} p=${profile} size=${56} />
        ${!isLocal ? html`<label class="btn small">Change photo<input type="file" accept="image/*" hidden onChange=${(e) => avatar(e.target.files[0])} /></label>` : null}</div>
      <label>Display name<input value=${p.display_name} onInput=${(e) => setP({ ...p, display_name: e.target.value })} /></label>
      ${!isLocal ? html`<label>Username<input value=${p.username} onInput=${(e) => setP({ ...p, username: e.target.value })} /></label>
        <label>Bio<textarea rows="2" value=${p.bio} onInput=${(e) => setP({ ...p, bio: e.target.value })}></textarea></label>` : null}
      <button class="btn primary" onClick=${saveP}>Save profile</button>
    </section>

    <section class="card">
      <h3>Your style</h3>
      <p class="muted small">Outfits that match these score higher. Pick a few.</p>
      <${Chips} small multi value=${profile.style_profile || []} onChange=${(v) => saveProfile({ style_profile: v })} options=${STYLE_TAGS} />
    </section>

    <section class="card">
      <h3>Your taste</h3>
      ${(() => {
        const ev = tasteEvents(), t = tasteSummary();
        const likes = ev.filter((e) => e.s > 0).length, dislikes = ev.length - likes;
        return html`<p class="muted small">Tap 👍 / 👎 on any outfit. Suggestions and the stylist learn from it. ${likes} liked · ${dislikes} disliked so far.</p>
          ${t.likes.length ? html`<div class="label">You tend to like</div><p class="small">${t.likes.join(' · ')}</p>` : null}
          ${t.dislikes.length ? html`<div class="label">You tend to avoid</div><p class="small">${t.dislikes.join(' · ')}</p>` : null}
          ${ev.length ? html`<button class="btn small" onClick=${() => confirmAsk('Forget everything you\'ve liked and disliked?') && saveS({ taste: [] })}>Reset what it learned</button>` : null}`;
      })()}
      <div class="mt"><${Toggle} checked=${s.suggestAccessories !== false} onChange=${(c) => saveS({ suggestAccessories: c })} label="Add accessories to suggestions (hats, AirPods, watch, belt, bag…)" /></div>
    </section>

    <section class="card form">
      <h3>Weather & location</h3>
      <${Toggle} checked=${s.weatherMode === 'weather'} onChange=${(c) => saveS({ weatherMode: c ? 'weather' : 'indoor' })} label="Dress for the weather by default" />
      <${Segmented} value=${s.dayProfile} onChange=${(d) => saveS({ dayProfile: d })} options=${[['outside', 'Mostly outside'], ['mixed', 'Inside, out for a bit']]} />
      <label>Indoor temperature (°C)<input type="number" min="12" max="30" value=${s.indoorTemp} onChange=${(e) => saveS({ indoorTemp: Number(e.target.value) })} /></label>
      <div class="muted small">Location: ${s.location?.name || 'not set'}</div>
      <div class="row gap">
        <input class="grow" placeholder="Search a city" value=${city} onInput=${(e) => setCity(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && geocode(city).then(setCities)} />
        <button class="btn small" onClick=${() => geocode(city).then(setCities)}>Search</button>
        <button class="btn small" onClick=${() => currentPosition().then((l) => saveS({ location: { ...l, name: 'My location' } })).catch((e) => toast(e, 'error'))}>Use GPS</button>
      </div>
      ${cities.map((c) => html`<button class="list-row" onClick=${() => { saveS({ location: c }); setCities([]); setCity(''); }}>${c.name}</button>`)}
      <${Segmented} value=${s.units} onChange=${(u) => saveS({ units: u })} options=${[['C', '°C'], ['F', '°F']]} />
      <label>Currency<input value=${s.currency} maxlength="3" onChange=${(e) => saveS({ currency: e.target.value.toUpperCase() })} /></label>
    </section>

    ${!isLocal ? html`<section class="card form">
      <h3>Privacy</h3>
      <${Toggle} checked=${profile.is_public} onChange=${(c) => saveProfile({ is_public: c })} label="Public profile (others can see your public items)" />
      <${Toggle} checked=${s.defaultVisibility === 'public'} onChange=${(c) => saveS({ defaultVisibility: c ? 'public' : 'private' })} label="New items are public by default" />
    </section>` : html`<section class="card form">
      <h3>AI in demo mode</h3>
      <p class="muted small">Paste a free key from console.groq.com to use the AI stylist and tagging without setting up accounts. It's stored only in this browser.</p>
      <input type="password" placeholder="gsk_…" value=${key} onInput=${(e) => setKey(e.target.value)} />
      <button class="btn" onClick=${() => { localGroqKey.set(key.trim()); toast(key.trim() ? 'Key saved' : 'Key removed'); }}>Save key</button>
      <h3 class="mt">Accounts & sync</h3>
      <p class="muted small">To sign in on any device, share outfits and use the marketplace, follow the setup steps in README.md (free Supabase project + Groq key).</p>
    </section>`}

    <section class="card form">
      <h3>Account</h3>
      ${!isLocal ? html`<div class="row gap"><input class="grow" type="password" placeholder="New password" minlength="8" value=${pw} onInput=${(e) => setPw(e.target.value)} />
        <button class="btn small" disabled=${pw.length < 8} onClick=${() => auth.updatePassword(pw).then(() => { setPw(''); toast('Password changed'); }).catch((e) => toast(e, 'error'))}>Change</button></div>` : null}
      <button class="btn" onClick=${exportJson}>Export my data (JSON)</button>
      ${!isLocal ? html`<button class="btn" onClick=${() => auth.signOut()}>Sign out</button>` : null}
      <button class="btn danger" onClick=${async () => {
        if (!confirmAsk(isLocal ? 'Erase all demo data on this device?' : 'Permanently delete your account, closet and photos? This cannot be undone.')) return;
        try { await deleteAccount(); location.reload(); } catch (e) { toast(e, 'error'); }
      }}>${isLocal ? 'Erase demo data' : 'Delete account'}</button>
    </section>`;
}
