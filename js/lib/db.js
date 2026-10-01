// Data access. Two interchangeable backends behind one small API:
//  - Supabase (real accounts, sync, community) when config.js is filled in
//  - Local demo mode (IndexedDB in this browser) when it isn't
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { loadSupabase } from './deps.js';

export const isLocal = !SUPABASE_URL || !SUPABASE_ANON_KEY;
let supa = null;

export async function client() {
  if (isLocal) return null;
  if (supa) return supa;
  const { createClient } = await loadSupabase();
  supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: window.localStorage },
  });
  return supa;
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

// ------------------------------------------------------------------ local IndexedDB
const TABLES = ['profiles', 'items', 'collections', 'outfits', 'calendar', 'trips', 'listings', 'messages', 'follows', 'likes', 'blocks', 'reports'];
let idbP = null;
function idb() {
  idbP ||= new Promise((res, rej) => {
    const r = indexedDB.open('closet-demo', 1);
    r.onupgradeneeded = () => TABLES.forEach((t) => r.result.objectStoreNames.contains(t) || r.result.createObjectStore(t, { keyPath: 'id' }));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return idbP;
}
async function store(table, mode = 'readonly') {
  return (await idb()).transaction(table, mode).objectStore(table);
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function matches(row, q) {
  for (const [k, v] of Object.entries(q.eq || {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(q.neq || {})) if (row[k] === v) return false;
  for (const [k, v] of Object.entries(q.in || {})) if (!v.includes(row[k])) return false;
  for (const [k, v] of Object.entries(q.gte || {})) if (!(row[k] >= v)) return false;
  for (const [k, v] of Object.entries(q.lte || {})) if (!(row[k] <= v)) return false;
  for (const [k, v] of Object.entries(q.contains || {})) if (!(row[k] || []).includes(v)) return false;
  return true;
}

// ------------------------------------------------------------------ public API
export async function select(table, q = {}) {
  if (isLocal) {
    let rows = (await req((await store(table)).getAll())).filter((r) => matches(r, q));
    if (q.order) {
      const [col, asc = false] = q.order;
      rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows;
  }
  const c = await client();
  let s = c.from(table).select(q.columns || '*');
  for (const [k, v] of Object.entries(q.eq || {})) s = s.eq(k, v);
  for (const [k, v] of Object.entries(q.neq || {})) s = s.neq(k, v);
  for (const [k, v] of Object.entries(q.in || {})) s = s.in(k, v);
  for (const [k, v] of Object.entries(q.gte || {})) s = s.gte(k, v);
  for (const [k, v] of Object.entries(q.lte || {})) s = s.lte(k, v);
  for (const [k, v] of Object.entries(q.contains || {})) s = s.contains(k, [v]);
  if (q.search) s = s.ilike(q.search[0], `%${q.search[1]}%`);
  if (q.order) s = s.order(q.order[0], { ascending: !!q.order[1] });
  if (q.limit) s = s.limit(q.limit);
  const { data, error } = await s;
  if (error) throw error;
  return data;
}

export async function get(table, id) {
  if (isLocal) return (await req((await store(table)).get(id))) || null;
  const c = await client();
  const { data, error } = await c.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function insert(table, row) {
  if (isLocal) {
    const r = { id: uuid(), created_at: new Date().toISOString(), user_id: 'local', ...row };
    await req((await store(table, 'readwrite')).put(r));
    return r;
  }
  const c = await client();
  const { data, error } = await c.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function update(table, id, patch) {
  if (isLocal) {
    const s = await store(table, 'readwrite');
    const cur = await req(s.get(id));
    const r = { ...cur, ...patch };
    await req(s.put(r));
    return r;
  }
  const c = await client();
  const { data, error } = await c.from(table).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function remove(table, match) {
  if (isLocal) {
    const s = await store(table, 'readwrite');
    if (typeof match === 'string') return req(s.delete(match));
    const rows = (await req(s.getAll())).filter((r) => matches(r, { eq: match }));
    for (const r of rows) await req(s.delete(r.id));
    return;
  }
  const c = await client();
  let q = c.from(table).delete();
  if (typeof match === 'string') q = q.eq('id', match);
  else for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
}

// Composite-key tables (follows / likes / blocks)
export async function link(table, row) {
  if (isLocal) return insert(table, { id: Object.values(row).join(':'), ...row });
  const c = await client();
  const { error } = await c.from(table).upsert(row);
  if (error) throw error;
}

/** Upload an image blob. Returns a URL usable in <img src>. */
export async function uploadImage(blob, userId) {
  if (isLocal) {
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  }
  const c = await client();
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${uuid()}.${ext}`;
  const { error } = await c.storage.from('closet').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  return c.storage.from('closet').getPublicUrl(path).data.publicUrl;
}

export async function deleteImage(url) {
  if (isLocal || !url || !url.includes('/storage/v1/object/public/closet/')) return;
  const c = await client();
  await c.storage.from('closet').remove([url.split('/storage/v1/object/public/closet/')[1]]);
}

export async function invokeFunction(name, body) {
  const c = await client();
  const { data, error } = await c.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return data;
}

// ------------------------------------------------------------------ auth
const LOCAL_USER = { id: 'local', email: 'demo@this-device' };

export const auth = {
  async session() {
    if (isLocal) return { user: LOCAL_USER };
    const c = await client();
    const { data } = await c.auth.getSession();
    return data.session;
  },
  async onChange(cb) {
    if (isLocal) return () => {};
    const c = await client();
    const { data } = c.auth.onAuthStateChange((_e, session) => cb(session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    const c = await client();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password) {
    const c = await client();
    const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    return data;
  },
  async magicLink(email) {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  },
  async google() {
    const c = await client();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  },
  async resetPassword(email) {
    const c = await client();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/settings' });
    if (error) throw error;
  },
  async updatePassword(password) {
    const c = await client();
    const { error } = await c.auth.updateUser({ password });
    if (error) throw error;
  },
  async signOut() {
    if (isLocal) return;
    const c = await client();
    await c.auth.signOut();
  },
};
