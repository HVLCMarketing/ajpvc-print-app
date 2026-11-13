// Shared helpers for the order management system: the order records, the status list, and the emails.
// Orders are stored one JSON record per order in the "orders" blob store; their PDFs live in "order-pdfs".
import { getStore } from '@netlify/blobs';

export const MIN_QTY = 50;
export const DEFAULT_TO = 'marketing@heartandleg.com';

// the life of an order. "building" is set by the site while it makes the PDFs; the rest are set by the team.
export const STATUSES = [
  { id: 'building', label: 'Building PDFs' },
  { id: 'new', label: 'New' },
  { id: 'sent', label: 'Sent to print shop' },
  { id: 'production', label: 'In production' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'hold', label: 'On hold' },
  { id: 'cancelled', label: 'Cancelled' }
];
export const STATUS_IDS = STATUSES.map((s) => s.id);
export const statusLabel = (id) => (STATUSES.find((s) => s.id === id) || { label: id }).label;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const orderStore = () => getStore({ name: 'orders', consistency: 'strong' });
export const pdfStore = () => getStore({ name: 'order-pdfs' });

// ORD-0001, ORD-0002 ... (a simple counter; two orders in the same instant could share a number, the id is always unique)
export async function nextNumber(store) {
  const c = (await store.get('_counter', { type: 'json' })) || { n: 0 };
  c.n += 1;
  await store.setJSON('_counter', c);
  return 'ORD-' + String(c.n).padStart(4, '0');
}

export const saveOrder = (store, order) => store.setJSON(order.id, order);
export const getOrder = (store, id) => store.get(id, { type: 'json' });
export async function listOrders(store) {
  const { blobs } = await store.list();
  const all = await Promise.all(blobs.filter((b) => !b.key.startsWith('_')).map((b) => store.get(b.key, { type: 'json' })));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function addHistory(order, entry) {
  order.history = order.history || [];
  order.history.push({ at: new Date().toISOString(), ...entry });
  order.updatedAt = new Date().toISOString();
}

const resend = async (payload) => {
  if (!process.env.RESEND_API_KEY || !process.env.ORDER_EMAIL_FROM) return { ok: false, skipped: true, error: 'Email is not set up (RESEND_API_KEY and ORDER_EMAIL_FROM).' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ORDER_EMAIL_FROM, ...payload })
  });
  if (!res.ok) return { ok: false, error: `Resend error ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
};
const recipients = () => String(process.env.ORDER_EMAIL_TO || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean);

export const fileLink = (site, key) => `${site}/.netlify/functions/order-file?key=${encodeURIComponent(key)}`;

// the email the marketing team forwards to the print shop: attachment names and quantities, plus the order details
export async function sendPrintEmail(order, site, { attachFiles = true } = {}) {
  const MAX_ATTACH = 30 * 1024 * 1024;
  const files = (order.items || []).filter((i) => i.key);
  const failed = (order.items || []).filter((i) => !i.key);
  const store = pdfStore();
  const loaded = [];
  if (attachFiles) {
    let used = 0;
    for (const f of [...files].sort((a, b) => a.size - b.size)) {
      if (used + f.size > MAX_ATTACH) continue;
      const buf = await store.get(f.key, { type: 'arrayBuffer' });
      if (buf) { loaded.push({ filename: f.name, content: Buffer.from(buf).toString('base64'), key: f.key }); used += f.size; }
    }
  }
  const attached = new Set(loaded.map((l) => l.key));
  const loc = order.location || {};
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#4A5568;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1B2440;max-width:680px">
<h2 style="color:#16306E;margin:0 0 4px">Print order ${esc(order.number)} for the print shop</h2>
<p style="margin:0 0 16px;color:#4A5568">${esc(order.facility)} · ${esc(loc.locationName || '')}. Forward this email with its attachments.</p>
<p style="margin:0 0 6px"><b>Please print the attached files in these quantities:</b></p>
<table style="border-collapse:collapse;width:100%;margin-bottom:6px">
<tr style="background:#16306E;color:#fff"><th style="text-align:left;padding:6px 8px">Attachment</th><th style="text-align:right;padding:6px 8px">Quantity</th></tr>
${files.map((f) => `<tr style="border-bottom:1px solid #E2DED4"><td style="padding:6px 8px">${esc(f.name)}${attached.has(f.key) ? '' : ' <span style="color:#C8231E">(too large to attach; <a href="' + fileLink(site, f.key) + '">download</a>)</span>'}</td><td style="padding:6px 8px;text-align:right"><b>${esc((+f.qty).toLocaleString('en-US'))}</b></td></tr>`).join('')}
${failed.map((f) => `<tr style="border-bottom:1px solid #E2DED4"><td style="padding:6px 8px;color:#C8231E">${esc(f.label)}: PDF could not be built; print it from the app</td><td style="padding:6px 8px;text-align:right"><b>${esc(f.qty)}</b></td></tr>`).join('')}
</table>
<p style="margin:0 0 16px;color:#4A5568">Each file is the trim size plus 1/8 in bleed on every side, with crop marks on a slightly larger page. Two-sided pieces have the front on odd pages and the back on even pages. Supplied print-ready files (posters, sheets) are sent as designed.</p>
<h3 style="color:#16306E;margin:0 0 8px">Order details</h3>
<table style="border-collapse:collapse;margin-bottom:16px">
${row('Order', order.number)}${row('Requested by', order.name)}${row('Email', order.email)}${row('Phone', order.phone)}${row('Needed by', order.needed_by)}
${row('Ship to', order.ship_to)}${row('Notes', order.notes)}${row('Location', order.location_details)}${row('Business cards', order.card_details)}
</table>
<p style="color:#4A5568">Download links for every file work for 90 days.</p>
</div>`;
  const text = ['Please print the attached files in these quantities:', ...files.map((f) => `${f.name}: print ${(+f.qty).toLocaleString('en-US')}`), ...failed.map((f) => `${f.label}: PDF could not be built; print it from the app: ${f.qty}`)].join('\n');
  return resend({
    to: recipients(), reply_to: order.email || undefined,
    subject: `Print order ${order.number}: ${loc.locationName || order.facility || 'AJPVC'} (${(order.items || []).length} item${(order.items || []).length > 1 ? 's' : ''})`,
    html, text, attachments: loaded.map(({ filename, content }) => ({ filename, content }))
  });
}

const TRACK = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
};
export const trackingUrl = (t) => (t && t.number && TRACK[t.carrier] ? TRACK[t.carrier](t.number) : '');

// a short status email to the person who placed the order
export async function sendStatusEmail(order, note) {
  if (!order.email) return { ok: false, error: 'This order has no requester email.' };
  const t = order.tracking || {}, link = trackingUrl(t);
  const lines = {
    sent: 'Your order has been sent to the print shop.',
    production: 'Your order is in production at the print shop.',
    shipped: 'Your order has shipped.',
    delivered: 'Your order was marked delivered. Please let us know if anything is missing or wrong.',
    hold: 'Your order is on hold. We will follow up with you.',
    cancelled: 'Your order was cancelled.'
  };
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1B2440;max-width:600px">
<h2 style="color:#16306E;margin:0 0 8px">Order ${esc(order.number)}: ${esc(statusLabel(order.status))}</h2>
<p>Hi ${esc((order.name || '').split(' ')[0] || 'there')},</p>
<p>${esc(lines[order.status] || 'Your order status changed to ' + statusLabel(order.status) + '.')}</p>
${t.number ? `<p><b>Tracking:</b> ${esc(t.carrier || '')} ${link ? `<a href="${esc(link)}">${esc(t.number)}</a>` : esc(t.number)}${t.eta ? `<br><b>Expected delivery:</b> ${esc(t.eta)}` : ''}</p>` : ''}
${note ? `<p>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
<p style="color:#4A5568">Items: ${(order.items || []).map((i) => esc(i.label) + ' × ' + esc(i.qty)).join('; ')}</p>
<p style="color:#4A5568">Questions? Reply to this email or write marketing@heartandleg.com.</p></div>`;
  return resend({ to: [order.email], reply_to: recipients()[0], subject: `Order ${order.number}: ${statusLabel(order.status)}`, html });
}
