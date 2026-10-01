import { html, useState, useEffect, useRef } from '../lib/deps.js';
import { useStore, listListings, getListing, saveListing, deleteListing, inbox, thread, sendMessage, getProfiles, me, settings, report, itemById } from '../lib/store.js';
import { isLocal } from '../lib/db.js';
import { Header, Icon, Empty, Spinner, Chips, navigate, toast, useAsync, money, timeAgo, confirmAsk } from '../ui/components.js';
import { Avatar } from './social.js';

const KINDS = [['sale', 'For sale'], ['swap', 'Swap'], ['free', 'Free']];
const CONDITIONS = ['new with tags', 'like new', 'good', 'fair'];

export function MarketView() {
  const [kind, setKind] = useState(null);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const data = useAsync(() => listListings({ kind, search: q.length >= 2 ? q : null, user: mine ? me() : null }), [kind, q, mine]);
  return html`
    <${Header} title="Marketplace" backTo="/explore" right=${html`<a class="icon-btn" href="#/messages" aria-label="Messages"><${Icon} name="message" /></a>`} />
    <p class="muted small">List clothes from your closet item page ("Sell or swap"). Payment and hand-over are arranged between you in messages.</p>
    <div class="search"><${Icon} name="search" size=${18} /><input placeholder="Search listings" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    <div class="row gap"><${Chips} small value=${kind} onChange=${setKind} options=${KINDS} /><span class="grow"></span>
      <button class=${'chip' + (mine ? ' on' : '')} onClick=${() => setMine(!mine)}>My listings</button></div>
    ${data.loading ? html`<${Spinner} />` : data.data?.length ? html`<div class="grid">${data.data.map((l) => html`
      <a class="item-thumb listing" href=${'#/listing/' + l.id}>
        <div class="img"><img src=${l.image_url} alt="" loading="lazy" /></div>
        ${l.status === 'reserved' ? html`<span class="tag-status in_wash">Reserved</span>` : null}
        <div class="cap"><b>${l.kind === 'sale' ? money(l.price, l.currency) : l.kind === 'swap' ? 'Swap' : 'Free'}</b> ${l.title}</div>
        <div class="muted small">${[l.size, l.location].filter(Boolean).join(' · ')}</div>
      </a>`)}</div>`
    : html`<${Empty} icon="bag" title="No listings">${isLocal ? 'The marketplace needs accounts (see README).' : 'Nothing here yet.'}<//>`}`;
}

export function NewListingView({ itemId }) {
  const st = useStore();
  const item = itemById(itemId);
  const [l, setL] = useState({ title: item ? item.name || `${item.colors[0]?.name || ''} ${item.subcategory}`.trim() : '', description: item?.description || '',
    price: '', currency: settings().currency, kind: 'sale', size: item?.size || '', condition: 'good', location: settings().location?.name && settings().location.name !== 'My location' ? settings().location.name : '' });
  const [busy, setBusy] = useState(false);
  if (isLocal) return html`<${Header} title="Sell or swap" backTo="" /><${Empty} icon="bag" title="Needs accounts">Set up Supabase to use the marketplace.<//>`;
  if (!item) return html`<${Header} title="Sell or swap" backTo="" /><${Empty} title="Item not found" />`;
  const set = (k, v) => setL({ ...l, [k]: v });
  async function save() {
    setBusy(true);
    try {
      const saved = await saveListing({ ...l, price: l.kind === 'sale' ? Number(l.price) || 0 : null, item_id: item.id, image_url: item.image_url });
      toast('Listed!');
      navigate('/listing/' + saved.id);
    } catch (e) { toast(e, 'error'); }
    setBusy(false);
  }
  return html`
    <${Header} title="Sell or swap" backTo="" />
    <div class="item-hero checker small"><img src=${item.image_url} alt="" /></div>
    <div class="card form">
      <${Chips} value=${l.kind} onChange=${(k) => k && set('kind', k)} options=${KINDS} />
      <label>Title<input value=${l.title} onInput=${(e) => set('title', e.target.value)} /></label>
      ${l.kind === 'sale' ? html`<div class="row gap"><label class="grow">Price<input type="number" min="0" step="0.5" value=${l.price} onInput=${(e) => set('price', e.target.value)} /></label>
        <label>Currency<input value=${l.currency} maxlength="3" style="width:5em" onInput=${(e) => set('currency', e.target.value.toUpperCase())} /></label></div>` : null}
      <div class="row gap"><label class="grow">Size<input value=${l.size} onInput=${(e) => set('size', e.target.value)} /></label>
        <label class="grow">Condition<select value=${l.condition} onChange=${(e) => set('condition', e.target.value)}>${CONDITIONS.map((c) => html`<option>${c}</option>`)}</select></label></div>
      <label>Location<input value=${l.location} placeholder="City (for pick-up)" onInput=${(e) => set('location', e.target.value)} /></label>
      <label>Description<textarea rows="3" value=${l.description} onInput=${(e) => set('description', e.target.value)}></textarea></label>
      <button class="btn primary wide" disabled=${busy || !l.title.trim()} onClick=${save}>${busy ? 'Listing…' : 'Publish listing'}</button>
      <p class="muted small">Never share card details in messages. Meet in public places or use tracked shipping.</p>
    </div>`;
}

export function ListingView({ id }) {
  const data = useAsync(async () => {
    const l = await getListing(id);
    if (!l) return null;
    const [seller] = await getProfiles([l.user_id]);
    return { l, seller };
  }, [id]);
  if (data.loading) return html`<${Header} title="Listing" backTo="/market" /><${Spinner} />`;
  if (!data.data) return html`<${Header} title="Listing" backTo="/market" /><${Empty} title="Listing not found">It may have been sold.<//>`;
  const { l, seller } = data.data;
  const mine = l.user_id === me();
  const setStatus = async (status) => { await saveListing({ id: l.id, status }); toast('Updated'); data.reload(); };
  return html`
    <${Header} title=${l.title} backTo="/market" right=${!mine ? html`<button class="icon-btn" aria-label="Report" onClick=${async () => { const r = prompt('What\'s wrong with this listing?'); if (r) { await report('listing', l.id, r); toast('Reported — thanks'); } }}><${Icon} name="flag" /></button>` : null} />
    <div class="item-hero checker"><img src=${l.image_url} alt="" /></div>
    <div class="card">
      <div class="row"><h2 class="grow">${l.kind === 'sale' ? money(l.price, l.currency) : l.kind === 'swap' ? 'Swap' : 'Free'}</h2><span class="muted small">${timeAgo(l.created_at)}</span></div>
      <dl class="specs">
        ${l.size ? html`<dt>Size</dt><dd>${l.size}</dd>` : null}
        ${l.condition ? html`<dt>Condition</dt><dd>${l.condition}</dd>` : null}
        ${l.location ? html`<dt>Location</dt><dd>${l.location}</dd>` : null}
        <dt>Status</dt><dd>${l.status}</dd>
      </dl>
      ${l.description ? html`<p>${l.description}</p>` : null}
    </div>
    <a class="list-row" href=${'#/u/' + seller?.username}><${Avatar} p=${seller} /><span class="grow"><b>${seller?.display_name || seller?.username}</b><div class="muted small">@${seller?.username}</div></span></a>
    ${mine ? html`<div class="actions">
      ${l.status !== 'reserved' ? html`<button class="btn" onClick=${() => setStatus('reserved')}>Mark reserved</button>` : html`<button class="btn" onClick=${() => setStatus('active')}>Mark available</button>`}
      <button class="btn primary" onClick=${() => setStatus('sold')}>Mark sold</button>
      <button class="btn danger" onClick=${async () => { if (confirmAsk('Delete this listing?')) { await deleteListing(l.id); navigate('/market'); } }}>Delete</button>
    </div>` : html`<div class="actions"><button class="btn primary wide" onClick=${() => navigate(`/chat/${l.id}/${l.user_id}`)}><${Icon} name="message" /> Message seller</button></div>`}`;
}

export function InboxView() {
  const data = useAsync(async () => {
    const threads = await inbox();
    const profiles = await getProfiles(threads.map((t) => t.other));
    const pm = new Map(profiles.map((p) => [p.id, p]));
    return threads.map((t) => ({ ...t, profile: pm.get(t.other) }));
  }, []);
  return html`
    <${Header} title="Messages" backTo="/explore" />
    ${isLocal ? html`<${Empty} icon="message" title="Messages need accounts" />` : data.loading ? html`<${Spinner} />` : data.data?.length ? html`<div class="list">${data.data.map((t) => html`
      <a class="list-row" href=${`#/chat/${t.listing_id || 'direct'}/${t.other}`}><${Avatar} p=${t.profile} />
        <span class="grow"><b>${t.profile?.display_name || t.profile?.username || 'User'}</b>${t.listing_id ? html` <span class="muted small">· listing</span>` : null}
          <div class="muted small ellipsis">${t.last.sender === me() ? 'You: ' : ''}${t.last.body}</div></span>
        <span class="muted small">${timeAgo(t.last.created_at)}</span>${t.unread ? html`<span class="unread">${t.unread}</span>` : null}</a>`)}</div>`
    : html`<${Empty} icon="message" title="No messages yet" />`}`;
}

export function ChatView({ listing, user }) {
  const [msgs, setMsgs] = useState(null);
  const [other, setOther] = useState(null);
  const [lst, setLst] = useState(null);
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const load = () => thread(listing, user).then(setMsgs).catch((e) => toast(e, 'error'));
  useEffect(() => {
    load();
    getProfiles([user]).then(([p]) => setOther(p));
    if (listing !== 'direct') getListing(listing).then(setLst).catch(() => {});
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [listing, user]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [msgs?.length]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try { await sendMessage(user, body, listing); load(); } catch (err) { toast(err, 'error'); setText(body); }
  }
  return html`
    <${Header} title=${other ? other.display_name || '@' + other.username : 'Chat'} backTo="/messages" sub=${lst ? html`<a href=${'#/listing/' + lst.id}>${lst.title}</a>` : null} />
    <div class="chat">
      ${!msgs ? html`<${Spinner} />` : msgs.map((m) => html`<div class=${'msg ' + (m.sender === me() ? 'user' : 'assistant')}><div class="bubble">${m.body}<div class="time">${timeAgo(m.created_at)}</div></div></div>`)}
      <div ref=${endRef}></div>
    </div>
    <form class="composer" onSubmit=${send}>
      <input value=${text} maxlength="2000" placeholder="Message…" aria-label="Message" onInput=${(e) => setText(e.target.value)} />
      <button class="btn primary" disabled=${!text.trim()} aria-label="Send"><${Icon} name="up" /></button>
    </form>`;
}
