// Order management API (team passcode required for everything).
// GET    /api/orders               -> every order, newest first
// GET    /api/orders?id=...        -> one order
// PATCH  /api/orders?id=...        -> update: { status, note, notify, tracking, printShop, internalNote }
// POST   /api/orders?id=...&action=resend -> email the print files to the marketing team again
// POST   /api/orders?check=1       -> checks the passcode only
// The passcode is the same EDIT_PASSCODE used for editing locations.
import { orderStore, listOrders, getOrder, saveOrder, addHistory, STATUS_IDS, statusLabel, sendPrintEmail, sendStatusEmail } from '../lib/orders.mjs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const str = (v, n = 300) => String(v ?? '').slice(0, n);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const CARRIERS = ['', 'UPS', 'FedEx', 'USPS', 'Other'];

export default async (req) => {
  const expected = process.env.EDIT_PASSCODE;
  if (!expected) return json({ error: 'The order manager is not set up yet. Add an EDIT_PASSCODE environment variable in Netlify and redeploy.' }, 503);
  if (req.headers.get('x-edit-passcode') !== expected) return json({ error: 'Wrong passcode.' }, 401);
  const url = new URL(req.url), id = url.searchParams.get('id') || '';
  const store = orderStore();

  if (req.method === 'POST' && url.searchParams.has('check')) return new Response(null, { status: 204 });

  if (req.method === 'GET') {
    if (!id) return json(await listOrders(store));
    if (!ID.test(id)) return json({ error: 'Invalid id.' }, 400);
    const o = await getOrder(store, id);
    return o ? json(o) : json({ error: 'Order not found.' }, 404);
  }

  if (!ID.test(id)) return json({ error: 'Invalid id.' }, 400);
  const order = await getOrder(store, id);
  if (!order) return json({ error: 'Order not found.' }, 404);

  if (req.method === 'POST' && url.searchParams.get('action') === 'resend') {
    const site = process.env.URL || url.origin;
    const r = await sendPrintEmail(order, site);
    order.email_sent = r.ok ? { ok: true, at: new Date().toISOString() } : { ok: false, error: r.error };
    addHistory(order, { note: r.ok ? 'Print files emailed to marketing again.' : 'Resend failed: ' + r.error });
    await saveOrder(store, order);
    return json(order);
  }

  if (req.method === 'PATCH') {
    let b;
    try { b = await req.json(); } catch { return json({ error: 'Invalid data.' }, 400); }
    const by = str(b.by, 60);
    const events = [];
    if (b.tracking) {
      const t = { carrier: CARRIERS.includes(b.tracking.carrier) ? b.tracking.carrier : '', number: str(b.tracking.number, 80).trim(), eta: str(b.tracking.eta, 40) };
      if (JSON.stringify(t) !== JSON.stringify(order.tracking || {})) { order.tracking = t; events.push('Tracking updated.'); }
    }
    if (b.printShop) {
      const p = { name: str(b.printShop.name, 120), po: str(b.printShop.po, 60), quote: str(b.printShop.quote, 40), sentAt: order.printShop?.sentAt || '' };
      if (JSON.stringify(p) !== JSON.stringify(order.printShop || {})) { order.printShop = p; events.push('Print shop details updated.'); }
    }
    if (b.needed_by !== undefined && str(b.needed_by, 20) !== order.needed_by) { order.needed_by = str(b.needed_by, 20); events.push('Needed-by date changed to ' + order.needed_by + '.'); }
    let statusChanged = false;
    if (b.status && b.status !== order.status) {
      if (!STATUS_IDS.includes(b.status) || b.status === 'building') return json({ error: 'Unknown status.' }, 400);
      order.status = b.status; statusChanged = true;
      if (b.status === 'sent') { order.printShop = { ...(order.printShop || {}), sentAt: new Date().toISOString() }; }
      if (b.status === 'delivered') order.deliveredAt = new Date().toISOString();
    }
    const note = str(b.note, 1000).trim();
    if (statusChanged) addHistory(order, { status: order.status, by, note: note || undefined });
    else if (note) addHistory(order, { by, note });
    events.forEach((e) => addHistory(order, { by, note: e }));
    if (b.notify && statusChanged) {
      const r = await sendStatusEmail(order, note);
      addHistory(order, { by, note: r.ok ? `Requester emailed: ${statusLabel(order.status)}.` : 'Requester email failed: ' + r.error });
    }
    await saveOrder(store, order);
    return json(order);
  }

  return json({ error: 'Method not allowed.' }, 405);
};

export const config = { path: '/api/orders' };
