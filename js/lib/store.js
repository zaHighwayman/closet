// App state + domain operations (closet, outfits, laundry, calendar, social, market).
import { useEffect, useState } from './deps.js';
import * as db from './db.js';
import { FUNCTION_NAME } from '../config.js';
import { applyWear, undoWear, markClean } from '../styling/laundry.js';
import { normalizeItem } from '../styling/taxonomy.js';
import { signature } from '../styling/engine.js';
import { compileTaste, describeTaste } from '../styling/taste.js';

// ------------------------------------------------------------------ tiny reactive store
const state = { session: undefined, profile: null, items: null, outfits: null, collections: null };
const subs = new Set();
export const getState = () => state;
export function setState(patch) { Object.assign(state, patch); subs.forEach((f) => f()); }
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return state;
}
export const me = () => state.session?.user?.id;

// ------------------------------------------------------------------ settings
export const DEFAULT_SETTINGS = {
  weatherMode: 'weather', dayProfile: 'outside', indoorTemp: 21, units: 'C', currency: 'EUR',
  location: null, defaultVisibility: 'public', occasion: 'casual',
};
export const settings = () => ({ ...DEFAULT_SETTINGS, ...(state.profile?.settings || {}) });
export async function saveSettings(patch) {
  return saveProfile({ settings: { ...settings(), ...patch } });
}

// ------------------------------------------------------------------ taste (👍 / 👎 on outfits)
const sig = (ids) => [...ids].sort().join('|');
export const tasteEvents = () => settings().taste || [];
export const tasteOf = (ids) => tasteEvents().find((e) => sig(e.ids) === sig(ids))?.s || 0;
/** s: 1 like, -1 dislike, 0 clear. Kept on the profile (last 400). */
export async function rateOutfit(ids, s) {
  const events = tasteEvents().filter((e) => sig(e.ids) !== sig(ids));
  if (s) events.push({ ids: [...ids], s, t: Date.now() });
  await saveSettings({ taste: events.slice(-400) });
}
let tasteCache = { key: '', model: null };
export function tasteModel() {
  const ev = tasteEvents();
  const key = `${ev.length}:${ev[ev.length - 1]?.t || 0}:${state.items?.length || 0}`;
  if (tasteCache.key !== key) tasteCache = { key, model: compileTaste(ev, new Map((state.items || []).map((i) => [i.id, i]))) };
  return tasteCache.model;
}
export const tasteSummary = () => describeTaste(tasteModel(), new Map((state.items || []).map((i) => [i.id, i])));

// ------------------------------------------------------------------ profile
export async function loadProfile() {
  let p = await db.get('profiles', me());
  if (!p && db.isLocal) p = await db.insert('profiles', { id: 'local', username: 'me', display_name: 'Me', style_profile: [], settings: {}, is_public: false });
  setState({ profile: p });
  return p;
}
export async function saveProfile(patch) {
  const p = await db.update('profiles', me(), patch);
  setState({ profile: p });
  return p;
}
export const getProfileByUsername = async (username) => (await db.select('profiles', { eq: { username }, limit: 1 }))[0] || null;
export const getProfiles = async (ids) => (ids.length ? db.select('profiles', { in: { id: [...new Set(ids)] } }) : []);
export const searchProfiles = (q) => db.select('profiles', { search: ['username', q], limit: 20 });

// ------------------------------------------------------------------ items
const COLUMNS = ['id', 'user_id', 'name', 'category', 'subcategory', 'image_url', 'status', 'wears_since_wash', 'wear_limit',
  'wear_count', 'last_worn', 'price', 'brand', 'size', 'purchase_date', 'notes', 'visibility', 'created_at'];

export function fromRow(row) {
  const { attrs, ...rest } = row;
  return normalizeItem({ ...(attrs || {}), ...rest });
}
function toRow(item) {
  const row = { attrs: {} };
  for (const [k, v] of Object.entries(item)) {
    if (COLUMNS.includes(k)) row[k] = v === '' ? null : v;
    else if (k !== 'attrs') row.attrs[k] = v;
  }
  return row;
}

export async function loadItems() {
  const rows = await db.select('items', { eq: { user_id: me() }, order: ['created_at', false] });
  const items = rows.map(fromRow);
  setState({ items });
  return items;
}
export async function addItem(item) {
  const row = toRow({ visibility: settings().defaultVisibility, status: 'clean', wears_since_wash: 0, wear_count: 0, ...item });
  delete row.id;
  const saved = fromRow(await db.insert('items', row));
  setState({ items: [saved, ...(state.items || [])] });
  return saved;
}
export async function saveItem(id, patch) {
  const cur = state.items?.find((i) => i.id === id) || {};
  // attrs is one JSON column, so merge before writing
  const full = toRow({ ...cur, ...patch });
  const row = { attrs: full.attrs };
  for (const k of Object.keys(patch)) if (COLUMNS.includes(k)) row[k] = full[k];
  delete row.id; delete row.user_id; delete row.created_at;
  const saved = fromRow(await db.update('items', id, row));
  setState({ items: (state.items || []).map((i) => (i.id === id ? saved : i)) });
  return saved;
}
export async function deleteItem(id) {
  const it = state.items?.find((i) => i.id === id);
  await db.remove('items', id);
  if (it?.image_url) db.deleteImage(it.image_url).catch(() => {});
  setState({ items: (state.items || []).filter((i) => i.id !== id) });
}
export const itemById = (id) => state.items?.find((i) => i.id === id);
export async function fetchItems(ids) {
  if (!ids.length) return [];
  return (await db.select('items', { in: { id: [...new Set(ids)] } })).map(fromRow);
}

// ------------------------------------------------------------------ laundry
export async function setStatus(ids, status) {
  for (const id of ids) {
    await saveItem(id, status === 'clean' ? markClean() : { status });
  }
}

/** Log that items were worn on a date: wear log entry + laundry counters. */
export async function logWear(itemIds, { date = todayStr(), outfitId = null, note = null } = {}) {
  const entry = await db.insert('calendar', { date, item_ids: itemIds, outfit_id: outfitId, worn: true, note });
  const when = new Date(date + 'T12:00:00');
  for (const id of itemIds) {
    const it = itemById(id);
    if (it) await saveItem(id, applyWear(it, when));
  }
  return entry;
}
export async function unlogWear(entry) {
  await db.remove('calendar', entry.id);
  for (const id of entry.item_ids || []) {
    const it = itemById(id);
    if (it) await saveItem(id, undoWear(it));
  }
}
export async function markPlannedWorn(entry) {
  await db.update('calendar', entry.id, { worn: true });
  const when = new Date(entry.date + 'T12:00:00');
  for (const id of entry.item_ids || []) {
    const it = itemById(id);
    if (it) await saveItem(id, applyWear(it, when));
  }
}

// ------------------------------------------------------------------ outfits & collections
export async function loadOutfits() {
  const outfits = await db.select('outfits', { eq: { user_id: me() }, order: ['created_at', false] });
  setState({ outfits });
  return outfits;
}
export async function saveOutfit(o) {
  const row = { name: o.name || null, item_ids: o.item_ids, layout: o.layout || [], occasion: o.occasion || null, notes: o.notes || null,
    rating: o.rating ?? null, reasons: o.reasons || [], collection_id: o.collection_id || null, visibility: o.visibility || 'private' };
  const saved = o.id ? await db.update('outfits', o.id, row) : await db.insert('outfits', row);
  const list = state.outfits || [];
  setState({ outfits: o.id ? list.map((x) => (x.id === o.id ? saved : x)) : [saved, ...list] });
  return saved;
}
export async function deleteOutfit(id) {
  await db.remove('outfits', id);
  setState({ outfits: (state.outfits || []).filter((o) => o.id !== id) });
}
export async function loadCollections() {
  const collections = await db.select('collections', { eq: { user_id: me() }, order: ['created_at', true] });
  setState({ collections });
  return collections;
}
export async function addCollection(name) {
  const c = await db.insert('collections', { name });
  setState({ collections: [...(state.collections || []), c] });
  return c;
}
export async function deleteCollection(id) {
  await db.remove('collections', id);
  setState({ collections: (state.collections || []).filter((c) => c.id !== id) });
}

// ------------------------------------------------------------------ calendar
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const listCalendar = (from, to) => db.select('calendar', { eq: { user_id: me() }, gte: { date: from }, lte: { date: to }, order: ['date', true] });
export const planOutfit = (date, itemIds, outfitId = null) => db.insert('calendar', { date, item_ids: itemIds, outfit_id: outfitId, worn: false });
export const deleteCalendarEntry = (id) => db.remove('calendar', id);

/** Signatures of outfits worn in the last 14 days (engine avoids repeating them). */
export async function recentCombos() {
  const from = todayStr(new Date(Date.now() - 14 * 864e5));
  const rows = await listCalendar(from, todayStr());
  return new Set(rows.filter((r) => r.worn).map((r) => signature(r.item_ids.map((id) => ({ id })))));
}

// ------------------------------------------------------------------ trips
export const listTrips = () => db.select('trips', { eq: { user_id: me() }, order: ['start_date', false] });
export const getTrip = (id) => db.get('trips', id);
export const saveTrip = (t) => (t.id ? db.update('trips', t.id, t) : db.insert('trips', t));
export const deleteTrip = (id) => db.remove('trips', id);

// ------------------------------------------------------------------ community
export async function following() {
  return (await db.select('follows', { eq: { follower: me() } })).map((f) => f.followee);
}
export const followersOf = async (id) => (await db.select('follows', { eq: { followee: id } })).map((f) => f.follower);
export const followingOf = async (id) => (await db.select('follows', { eq: { follower: id } })).map((f) => f.followee);
export const follow = (id) => db.link('follows', { follower: me(), followee: id });
export const unfollow = (id) => db.remove('follows', { follower: me(), followee: id });
export async function blockedIds() {
  return (await db.select('blocks', { eq: { blocker: me() } })).map((b) => b.blocked);
}
export const block = (id) => db.link('blocks', { blocker: me(), blocked: id });
export const unblock = (id) => db.remove('blocks', { blocker: me(), blocked: id });
export const report = (target_type, target_id, reason) => db.insert('reports', { target_type, target_id: String(target_id), reason });

/** Public outfits with their items, authors and like counts. kind: 'following' | 'discover' | userId */
export async function feed(kind = 'discover', limit = 30) {
  if (db.isLocal) return [];
  const q = { eq: { visibility: 'public' }, order: ['created_at', false], limit };
  if (kind === 'following') {
    const f = await following();
    if (!f.length) return [];
    q.in = { user_id: f };
  } else if (kind !== 'discover') q.eq.user_id = kind;
  const [outfits, blocked] = await Promise.all([db.select('outfits', q), blockedIds()]);
  const list = outfits.filter((o) => !blocked.includes(o.user_id));
  return hydrateOutfits(list);
}
export async function hydrateOutfits(list) {
  if (!list.length) return [];
  const [items, profiles, likes] = await Promise.all([
    fetchItems(list.flatMap((o) => o.item_ids)),
    getProfiles(list.map((o) => o.user_id)),
    db.isLocal ? [] : db.select('likes', { in: { outfit_id: list.map((o) => o.id) } }),
  ]);
  const im = new Map(items.map((i) => [i.id, i]));
  const pm = new Map(profiles.map((p) => [p.id, p]));
  return list.map((o) => ({
    ...o,
    items: o.item_ids.map((id) => im.get(id)).filter(Boolean),
    author: pm.get(o.user_id),
    likes: likes.filter((l) => l.outfit_id === o.id).length,
    liked: likes.some((l) => l.outfit_id === o.id && l.user_id === me()),
  }));
}
export const like = (outfitId) => db.link('likes', { user_id: me(), outfit_id: outfitId });
export const unlike = (outfitId) => db.remove('likes', { user_id: me(), outfit_id: outfitId });
export async function publicItemsOf(userId) {
  return (await db.select('items', { eq: { user_id: userId, visibility: 'public' }, order: ['created_at', false] })).map(fromRow);
}

// ------------------------------------------------------------------ marketplace
export async function listListings({ kind, search, user } = {}) {
  const q = { neq: { status: 'sold' }, order: ['created_at', false], limit: 60 };
  if (kind) q.eq = { kind };
  if (user) q.eq = { ...(q.eq || {}), user_id: user };
  if (search) q.search = ['title', search];
  const [rows, blocked] = await Promise.all([db.select('listings', q), db.isLocal ? [] : blockedIds()]);
  return rows.filter((r) => !blocked.includes(r.user_id));
}
export const getListing = (id) => db.get('listings', id);
export const saveListing = (l) => (l.id ? db.update('listings', l.id, l) : db.insert('listings', l));
export const deleteListing = (id) => db.remove('listings', id);

export async function inbox() {
  const [sent, got] = await Promise.all([
    db.select('messages', { eq: { sender: me() }, order: ['created_at', false], limit: 300 }),
    db.select('messages', { eq: { recipient: me() }, order: ['created_at', false], limit: 300 }),
  ]);
  const threads = new Map();
  for (const m of [...sent, ...got].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    const other = m.sender === me() ? m.recipient : m.sender;
    const key = `${m.listing_id || 'direct'}:${other}`;
    if (!threads.has(key)) threads.set(key, { key, other, listing_id: m.listing_id, last: m, unread: 0 });
    if (m.recipient === me() && !m.read) threads.get(key).unread++;
  }
  return [...threads.values()];
}
export async function thread(listingId, otherId) {
  const lid = listingId === 'direct' ? null : listingId;
  const [a, b] = await Promise.all([
    db.select('messages', { eq: { sender: me(), recipient: otherId }, order: ['created_at', true] }),
    db.select('messages', { eq: { sender: otherId, recipient: me() }, order: ['created_at', true] }),
  ]);
  const msgs = [...a, ...b].filter((m) => (m.listing_id || null) === lid).sort((x, y) => (x.created_at > y.created_at ? 1 : -1));
  for (const m of msgs) if (m.recipient === me() && !m.read) db.update('messages', m.id, { read: true }).catch(() => {});
  return msgs;
}
export const sendMessage = (recipient, body, listingId) => db.insert('messages', { recipient, body, listing_id: listingId === 'direct' ? null : listingId || null });
export async function unreadCount() {
  if (db.isLocal || !me()) return 0;
  return (await db.select('messages', { eq: { recipient: me(), read: false }, columns: 'id' })).length;
}

// ------------------------------------------------------------------ account
export async function exportData() {
  const [items, outfits, collections, calendar, trips] = await Promise.all([
    db.select('items', { eq: { user_id: me() } }), db.select('outfits', { eq: { user_id: me() } }),
    db.select('collections', { eq: { user_id: me() } }), db.select('calendar', { eq: { user_id: me() } }),
    db.select('trips', { eq: { user_id: me() } }),
  ]);
  return { exported_at: new Date().toISOString(), profile: state.profile, items, outfits, collections, calendar, trips };
}
export async function deleteAccount() {
  if (db.isLocal) {
    indexedDB.deleteDatabase('closet-demo');
    return;
  }
  await db.invokeFunction(FUNCTION_NAME, { action: 'delete_account' });
  await db.auth.signOut();
}
