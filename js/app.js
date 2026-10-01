import { html, render, useEffect, useState } from './lib/deps.js';
import * as db from './lib/db.js';
import { useStore, getState, setState, loadProfile, loadItems, loadOutfits, loadCollections, unreadCount } from './lib/store.js';
import { Icon, Toasts, Spinner, navigate } from './ui/components.js';

import { AuthView } from './views/auth.js';
import { ClosetView, LaundryView } from './views/closet.js';
import { AddItemsView, ItemView } from './views/item.js';
import { StyleView } from './views/style.js';
import { OutfitsView, OutfitView, BuilderView } from './views/outfits.js';
import { StylistView } from './views/stylist.js';
import { PlanView, TripsView, TripView } from './views/plan.js';
import { StatsView, InspoView } from './views/insights.js';
import { ExploreView, ProfileView, MeView } from './views/social.js';
import { MarketView, ListingView, NewListingView, InboxView, ChatView } from './views/market.js';
import { SettingsView } from './views/settings.js';
import { DiscoverView } from './views/discover.js';

const ROUTES = [
  ['/closet', ClosetView], ['/closet/add', AddItemsView], ['/item/:id', ItemView], ['/laundry', LaundryView],
  ['/style', StyleView], ['/discover', DiscoverView], ['/outfits', OutfitsView], ['/outfit/:id', OutfitView], ['/builder', BuilderView], ['/builder/:id', BuilderView],
  ['/stylist', StylistView], ['/plan', PlanView], ['/trips', TripsView], ['/trip/:id', TripView],
  ['/stats', StatsView], ['/inspo', InspoView],
  ['/explore', ExploreView], ['/u/:username', ProfileView], ['/me', MeView],
  ['/market', MarketView], ['/listing/new/:itemId', NewListingView], ['/listing/:id', ListingView], ['/messages', InboxView], ['/chat/:listing/:user', ChatView],
  ['/settings', SettingsView],
];

function match(path) {
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const [pattern, View] of ROUTES) {
    const a = pattern.split('/'), b = p.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) return { View, params, query, pattern };
  }
  return null;
}

const getPath = () => location.hash.replace(/^#/, '') || '/closet';

const TABS = [
  ['/closet', 'closet', 'Closet'], ['/style', 'style', 'Style'], ['/stylist', 'chat', 'Stylist'], ['/plan', 'calendar', 'Plan'], ['/explore', 'explore', 'Explore'],
];
const TAB_OWNERS = { '/item': '/closet', '/laundry': '/closet', '/outfits': '/style', '/discover': '/style', '/outfit': '/style', '/builder': '/style', '/trips': '/plan', '/trip': '/plan',
  '/u': '/explore', '/market': '/explore', '/listing': '/explore', '/messages': '/explore', '/chat': '/explore', '/me': '/explore', '/stats': '/closet', '/inspo': '/style', '/settings': '/explore' };

function TabBar({ path, unread }) {
  const root = '/' + path.split('/')[1];
  const active = TAB_OWNERS[root] || root;
  return html`<nav class="tabbar" aria-label="Main">
    ${TABS.map(([to, icon, label]) => html`<a href=${'#' + to} class=${active === to ? 'on' : ''} aria-current=${active === to ? 'page' : null}>
      <span class="tab-ic"><${Icon} name=${icon} size=${22} />${to === '/explore' && unread ? html`<i class="dot"></i>` : null}</span><span>${label}</span></a>`)}
  </nav>`;
}

function App() {
  const st = useStore();
  const [path, setPath] = useState(getPath());
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const on = () => { setPath(getPath()); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  // Restore the saved session (stays signed in across visits), then follow auth changes.
  useEffect(() => {
    let off = () => {};
    (async () => {
      const session = await db.auth.session();
      setState({ session: session || null });
      off = await db.auth.onChange((s) => {
        const prev = getState().session?.user?.id;
        setState({ session: s || null });
        if (!s) setState({ profile: null, items: null, outfits: null, collections: null });
        else if (s.user.id !== prev) boot();
      });
      if (session) boot();
    })();
    return () => off();
  }, []);

  async function boot() {
    try {
      await loadProfile();
      await Promise.all([loadItems(), loadOutfits(), loadCollections()]);
      unreadCount().then(setUnread).catch(() => {});
      // clean ?code= from the URL after a magic-link / OAuth sign-in
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
    } catch (e) { console.error(e); setState({ bootError: e.message || String(e) }); }
  }

  useEffect(() => { if (st.session) unreadCount().then(setUnread).catch(() => {}); }, [path]);

  if (st.session === undefined) return html`<div class="boot"><${Spinner} /></div>`;
  if (!st.session) return html`<${AuthView} /><${Toasts} />`;
  if (st.bootError) return html`<div class="boot"><p>Couldn't load your closet: ${st.bootError}</p><p class="muted">If you just set up Supabase, check that you ran supabase/schema.sql.</p><button class="btn" onClick=${() => location.reload()}>Retry</button></div>`;
  if (!st.items || !st.profile) return html`<div class="boot"><${Spinner} label="Loading your closet…" /></div>`;

  const m = match(path);
  if (!m) { navigate('/closet'); return null; }
  const { View, params, query } = m;
  return html`
    ${db.isLocal ? html`<div class="demo-banner">Demo mode — data stays on this device. <a href="#/settings">Set up accounts</a></div>` : null}
    <main class="page" key=${path}><${View} ...${params} query=${query} /></main>
    <${TabBar} path=${path} unread=${unread} />
    <${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
