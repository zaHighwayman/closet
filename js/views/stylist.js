import { html, useState, useEffect, useRef } from '../lib/deps.js';
import { useStore, settings, me, recentCombos, tasteSummary } from '../lib/store.js';
import { generate, gapAnalysis } from '../styling/engine.js';
import { OCCASIONS } from '../styling/taxonomy.js';
import { describe } from '../styling/layering.js';
import { parseIntent, stylistReply, itemLine, aiAvailable } from '../lib/ai.js';
import { fmtTemp, describeCode } from '../lib/weather.js';
import { useWeather, forecastFor, baseContext } from '../ui/hooks.js';
import { Header, Icon, Empty } from '../ui/components.js';
import { OutfitCard, useOutfitActions } from './style.js';

const KEY = () => `closet.chat.${me()}`;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch { return []; } };
const store = (m) => { try { localStorage.setItem(KEY(), JSON.stringify(m.slice(-30))); } catch {} };

const SUGGESTIONS = [
  'What should I wear today?',
  'Smart casual for work — I\'m inside all day',
  'Something with a shirt under a knit',
  'Date night outfit, it might rain',
  'What should I buy next to get more outfits?',
];

export function StylistView() {
  const { items, profile } = useStore();
  const weather = useWeather();
  const [msgs, setMsgs] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const occasionRef = useRef(settings().occasion);
  const { actions, sheet } = useOutfitActions(items, occasionRef.current, '/stylist');

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, busy]);

  if (!aiAvailable()) return html`<${Header} title="Stylist" />
    <${Empty} icon="chat" title="AI stylist is off">In demo mode, add a free Groq API key in <a href="#/settings">Settings</a>. With accounts set up, it works automatically.<//>`;

  async function send(t) {
    const content = (t ?? text).trim();
    if (!content || busy) return;
    setText('');
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setBusy(true);
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }));
      const s = settings();
      const byId = new Map(items.map((i) => [i.id, i]));
      const idList = items.map((i) => `[${i.id}] ${i.name || describe(i)}${i.status !== 'clean' ? ' (' + i.status + ')' : ''}`).join('\n');
      const intent = await parseIntent(history, `Closet item ids:\n${idList}`).catch(() => ({ wants_outfits: true }));

      const f = forecastFor(weather);
      const wx = { mode: s.weatherMode, dayProfile: s.dayProfile, indoorTemp: s.indoorTemp, forecast: f };
      if (intent.setting === 'inside') wx.mode = 'indoor';
      else if (intent.setting === 'outside') { wx.mode = 'weather'; wx.dayProfile = 'outside'; }
      else if (intent.setting === 'mixed') { wx.mode = 'weather'; wx.dayProfile = 'mixed'; }
      const occasion = OCCASIONS[intent.occasion] ? intent.occasion : s.occasion;
      occasionRef.current = occasion;
      const must = (intent.must_include || []).filter((id) => byId.has(id));
      const dirtyAsked = must.filter((id) => byId.get(id).status !== 'clean');

      let candidates = [];
      if (intent.wants_outfits !== false) {
        const recent = await recentCombos().catch(() => new Set());
        candidates = generate(items, baseContext({ occasion, weather: wx, mustInclude: must.filter((id) => !dirtyAsked.includes(id)), exclude: intent.exclude || [], recentCombos: recent, count: 8 }));
      }
      const lookup = (id) => { const it = byId.get(id); return it ? `${it.name || describe(it)} [${id.slice(0, 8)}]` : id; };
      let gaps = '';
      if (/buy|shop|purchase|missing|gap|invest/i.test(content)) {
        gaps = 'Best additions by number of new outfits unlocked: ' + gapAnalysis(items, baseContext({ weather: { mode: 'indoor' } })).slice(0, 4)
          .map((g) => `${g.staple.name} (+${g.unlocked})`).join(', ');
      }
      const contextText = [
        `Today is ${new Date().toDateString()}.`,
        f ? `Weather: ${describeCode(f.code)[0]}, ${fmtTemp(f.temp)} (feels ${fmtTemp(f.feelsLike)})${f.rain ? ', rain likely' : ''}.` : 'Weather unknown.',
        `Setting: ${wx.mode === 'indoor' ? `mostly indoors (~${wx.indoorTemp}°C), forecast ignored` : wx.dayProfile === 'mixed' ? 'inside with some time outdoors' : 'mostly outside'}.`,
        `Occasion: ${OCCASIONS[occasion].label}.`,
        profile.style_profile?.length ? `Their style: ${profile.style_profile.join(', ')}.` : '',
        (() => { const t = tasteSummary(); return t.likes.length || t.dislikes.length ? `Learned from their 👍/👎 — likes: ${t.likes.join('; ') || '–'}. Dislikes: ${t.dislikes.join('; ') || '–'}. Respect these.` : ''; })(),
        dirtyAsked.length ? `They asked for ${dirtyAsked.map(lookup).join(', ')} but it's in the laundry.` : '',
        intent.notes ? `Other wishes: ${intent.notes}` : '',
        gaps,
      ].filter(Boolean).join('\n');

      const closetText = items.map(itemLine).join('\n');
      const r = await stylistReply(history, { closetText, contextText, candidates: candidates.map((c) => ({ ...c, lookup })) });
      const done = [...next, { role: 'assistant', content: r.reply, outfits: r.outfits.map((n) => candidates[n]), occasion }];
      setMsgs(done); store(done);
    } catch (e) {
      const done = [...next, { role: 'assistant', content: 'Sorry — ' + (e.message || e), error: true }];
      setMsgs(done);
    }
    setBusy(false);
  }

  return html`
    <${Header} title="Stylist" sub="Knows your clothes, the weather and what's in the wash" right=${html`<button class="btn small" disabled=${!msgs.length || busy} onClick=${() => { if (window.confirm('Clear this chat?')) { setMsgs([]); store([]); } }}><${Icon} name="trash" size=${16} /> Clear chat</button>`} />
    <div class="chat">
      ${!msgs.length ? html`<div class="chat-empty">
        <p class="muted">Ask for an outfit, an opinion, or what to buy. Suggestions only use clean clothes and real layering rules.</p>
        <div class="suggest">${SUGGESTIONS.map((s) => html`<button class="chip" onClick=${() => send(s)}>${s}</button>`)}</div>
      </div>` : null}
      ${msgs.map((m) => html`<div class=${'msg ' + m.role + (m.error ? ' error' : '')}>
        <div class="bubble">${m.content}</div>
        ${m.outfits?.length ? html`<div class="outfit-list">${m.outfits.filter(Boolean).map((o) => {
          const valid = o.itemIds.every((id) => items.some((i) => i.id === id));
          return valid ? html`<${OutfitCard} compact outfit=${o} items=${items} ...${actions(o)} />` : null;
        })}</div>` : null}
      </div>`)}
      ${busy ? html`<div class="msg assistant"><div class="bubble typing"><span></span><span></span><span></span></div></div>` : null}
      <div ref=${endRef}></div>
    </div>
    <form class="composer" onSubmit=${(e) => { e.preventDefault(); send(); }}>
      <input value=${text} placeholder="Ask your stylist…" aria-label="Message" onInput=${(e) => setText(e.target.value)} />
      <button class="btn primary" disabled=${busy || !text.trim()} aria-label="Send"><${Icon} name="up" /></button>
    </form>
    ${sheet}`;
}
