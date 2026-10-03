import { html, useState } from '../lib/deps.js';
import { useStore, feed, getProfileByUsername, searchProfiles, follow, unfollow, following, followersOf, followingOf, publicItemsOf, like, unlike, block, report, me, blockedIds, unblock } from '../lib/store.js';
import { isLocal } from '../lib/db.js';
import { Header, Icon, Board, ItemThumb, Empty, Spinner, Segmented, navigate, toast, useAsync, timeAgo, confirmAsk } from '../ui/components.js';

const Avatar = ({ p, size = 36 }) => p?.avatar_url
  ? html`<img class="avatar" src=${p.avatar_url} alt="" style=${`width:${size}px;height:${size}px`} />`
  : html`<span class="avatar ph" style=${`width:${size}px;height:${size}px`}>${(p?.display_name || p?.username || '?')[0].toUpperCase()}</span>`;

function FeedCard({ o }) {
  const [liked, setLiked] = useState(o.liked);
  const [n, setN] = useState(o.likes);
  async function toggle() {
    try {
      if (liked) { await unlike(o.id); setN(n - 1); } else { await like(o.id); setN(n + 1); }
      setLiked(!liked);
    } catch (e) { toast(e, 'error'); }
  }
  return html`<article class="feed-card">
    <a class="row gap feed-head" href=${'#/u/' + o.author?.username}><${Avatar} p=${o.author} /><b>@${o.author?.username}</b><span class="muted small">${timeAgo(o.created_at)}</span></a>
    <a href=${'#/outfit/' + o.id}><${Board} items=${o.items} layout=${o.layout} /></a>
    <div class="row gap feed-foot">
      <button class=${'icon-btn' + (liked ? ' liked' : '')} aria-label=${liked ? 'Unlike' : 'Like'} onClick=${toggle}><${Icon} name="heart" fill=${liked ? 'currentColor' : 'none'} /></button><span>${n}</span>
      <span class="grow muted small">${o.name || ''}</span>
    </div>
  </article>`;
}

export function ExploreView() {
  const [tab, setTab] = useState('discover');
  const [q, setQ] = useState('');
  const data = useAsync(() => (tab === 'people' ? (q.length >= 2 ? searchProfiles(q.toLowerCase()) : []) : feed(tab)), [tab, tab === 'people' ? q : '']);

  return html`
    <${Header} title="Explore" right=${html`
      <a class="icon-btn" href="#/messages" aria-label="Messages"><${Icon} name="message" /></a>
      <a class="icon-btn" href="#/me" aria-label="My profile"><${Icon} name="user" /></a>`} />
    <a class="market-banner" href="#/market"><${Icon} name="bag" /> <span class="grow"><b>Marketplace</b><span class="muted small"> — sell, swap or give away clothes</span></span><${Icon} name="back" cls="flip" /></a>
    ${isLocal ? html`<${Empty} icon="explore" title="Community needs accounts">Set up Supabase (see README) to share outfits, follow people and use the marketplace.<//>` : html`
      <${Segmented} value=${tab} onChange=${setTab} options=${[['discover', 'Discover'], ['following', 'Following'], ['people', 'People']]} />
      ${tab === 'people' ? html`<div class="search"><${Icon} name="search" size=${18} /><input placeholder="Search usernames" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>` : null}
      ${data.loading ? html`<${Spinner} />` : tab === 'people'
        ? html`<div class="list">${(data.data || []).filter((p) => p.id !== me()).map((p) => html`<a class="list-row" href=${'#/u/' + p.username}><${Avatar} p=${p} /><span class="grow"><b>${p.display_name || p.username}</b><div class="muted small">@${p.username}</div></span></a>`)}</div>`
        : data.data?.length ? html`<div class="feed">${data.data.map((o) => html`<${FeedCard} key=${o.id} o=${o} />`)}</div>`
        : html`<${Empty} icon="explore" title=${tab === 'following' ? 'Nothing from people you follow' : 'No public outfits yet'}>${tab === 'following' ? 'Follow people from Discover or People.' : 'Share an outfit publicly to be the first!'}<//>`}`}`;
}

export function ProfileView({ username }) {
  const st = useStore();
  const [tab, setTab] = useState('outfits');
  const prof = useAsync(async () => {
    const p = await getProfileByUsername(username);
    if (!p) return null;
    const [outfits, items, followers, followingList, mine, blocked] = await Promise.all([feed(p.id, 60), publicItemsOf(p.id), followersOf(p.id), followingOf(p.id), following(), blockedIds()]);
    return { p, outfits, items, followers, followingList, iFollow: mine.includes(p.id), blocked: blocked.includes(p.id) };
  }, [username]);
  if (prof.loading) return html`<${Header} title=${'@' + username} backTo="" /><${Spinner} />`;
  if (!prof.data) return html`<${Header} title=${'@' + username} backTo="" /><${Empty} title="User not found" />`;
  const { p, outfits, items, followers, followingList, iFollow, blocked } = prof.data;
  const isMe = p.id === me();

  async function toggleFollow() {
    try { iFollow ? await unfollow(p.id) : await follow(p.id); prof.reload(); } catch (e) { toast(e, 'error'); }
  }
  async function more() {
    const choice = prompt(`Type "block" to block @${p.username}, or describe a problem to report them:`);
    if (!choice) return;
    if (choice.trim().toLowerCase() === 'block') { await block(p.id); toast('Blocked'); prof.reload(); }
    else { await report('profile', p.id, choice); toast('Reported — thanks'); }
  }

  return html`
    <${Header} title=${p.display_name || p.username} backTo="" right=${!isMe ? html`<button class="icon-btn" aria-label="Report or block" onClick=${more}><${Icon} name="flag" /></button>` : html`<a class="icon-btn" href="#/settings" aria-label="Settings"><${Icon} name="settings" /></a>`} />
    <div class="profile-head">
      <${Avatar} p=${p} size=${72} />
      <div class="grow">
        <div class="muted">@${p.username}</div>
        <div class="row gap counts"><span><b>${outfits.length}</b> outfits</span><span><b>${followers.length}</b> followers</span><span><b>${followingList.length}</b> following</span></div>
        ${p.bio ? html`<p>${p.bio}</p>` : null}
        ${p.style_profile?.length ? html`<div class="muted small">${p.style_profile.join(' · ')}</div>` : null}
      </div>
    </div>
    ${!isMe ? html`<div class="actions">
      ${blocked ? html`<button class="btn" onClick=${async () => { await unblock(p.id); prof.reload(); }}>Unblock</button>` : html`
        <button class=${'btn' + (iFollow ? '' : ' primary')} onClick=${toggleFollow}>${iFollow ? 'Following' : 'Follow'}</button>
        <button class="btn" onClick=${() => navigate(`/chat/direct/${p.id}`)}><${Icon} name="message" /> Message</button>`}
    </div>` : null}
    <${Segmented} value=${tab} onChange=${setTab} options=${[['outfits', 'Outfits'], ['closet', `Closet (${items.length})`]]} />
    ${tab === 'outfits'
      ? (outfits.length ? html`<div class="grid outfits">${outfits.map((o) => html`<a class="outfit-tile" href=${'#/outfit/' + o.id}><${Board} items=${o.items} layout=${o.layout} /></a>`)}</div>` : html`<p class="muted center">No public outfits.</p>`)
      : (items.length ? html`<div class="grid">${items.map((it) => html`<${ItemThumb} item=${{ ...it, status: 'clean' }} onClick=${() => isMe && navigate('/item/' + it.id)} />`)}</div>` : html`<p class="muted center">${p.is_public ? 'No public items.' : 'This closet is private.'}</p>`)}`;
}

export function MeView() {
  const { profile, items, outfits } = useStore();
  const links = [
    ['/create', 'edit', 'Create a fit', ''], ['/outfits', 'save', 'Saved outfits', `${outfits.length}`], ['/stats', 'chart', 'Stats & what to buy', ''], ['/laundry', 'wash', 'Laundry', ''],
    ['/trips', 'trip', 'Trips', ''], ['/discover', 'bulb', 'Discover new outfit ideas', ''], ['/inspo', 'image', 'Recreate a look', ''], ['/market', 'bag', 'Marketplace', ''], ['/messages', 'message', 'Messages', ''],
    ['/settings', 'settings', 'Settings & style profile', ''],
  ];
  return html`
    <${Header} title="Me" backTo="/explore" />
    <div class="profile-head">
      <${Avatar} p=${profile} size=${64} />
      <div class="grow"><b>${profile.display_name || profile.username}</b><div class="muted">@${profile.username} · ${items.length} items</div>
        ${!isLocal ? html`<a class="small" href=${'#/u/' + profile.username}>View public profile</a>` : null}</div>
    </div>
    <div class="list">${links.map(([to, icon, label, extra]) => html`<a class="list-row" href=${'#' + to}><${Icon} name=${icon} /><span class="grow">${label}</span><span class="muted small">${extra}</span></a>`)}</div>`;
}

export { Avatar };
