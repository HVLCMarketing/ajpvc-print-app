// Shared location list for the AJPVC print app.
// GET    /api/locations            -> everyone can read the list
// PUT    /api/locations            -> save one location (body: location JSON), needs passcode
// DELETE /api/locations?id=...     -> delete one location, needs passcode
// POST   /api/locations?check=1    -> checks the passcode only
// The passcode is the EDIT_PASSCODE environment variable set in Netlify.
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const FIELDS = ['id', 'locationName', 'street', 'city', 'state', 'zip', 'hours', 'map',
  'openHouseDate', 'openHouseTime', 'talkDate', 'talkVenue', 'updatedAt'];

function clean(loc) {
  const out = {};
  for (const k of FIELDS) {
    if (loc[k] === undefined || loc[k] === null) continue;
    out[k] = String(loc[k]).slice(0, k === 'map' ? 3_000_000 : 300);
  }
  if (out.map && !out.map.startsWith('data:image/')) delete out.map;
  return out;
}

export default async (req) => {
  const store = getStore({ name: 'locations', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const list = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
    list.sort((a, b) => String(a.locationName || '').localeCompare(String(b.locationName || '')));
    return json(list);
  }

  const expected = process.env.EDIT_PASSCODE;
  if (!expected) return json({ error: 'Editing is not set up yet. Add an EDIT_PASSCODE environment variable in Netlify and redeploy.' }, 503);
  if (req.headers.get('x-edit-passcode') !== expected) return json({ error: 'Wrong passcode.' }, 401);

  if (req.method === 'POST' && url.searchParams.has('check')) return new Response(null, { status: 204 });

  if (req.method === 'PUT') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid data.' }, 400); }
    const loc = clean(body || {});
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(loc.id || '')) return json({ error: 'Missing or invalid id.' }, 400);
    loc.updatedAt = new Date().toISOString();
    await store.setJSON(loc.id, loc);
    return json(loc);
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return json({ error: 'Invalid id.' }, 400);
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Method not allowed.' }, 405);
};

export const config = { path: '/api/locations' };
