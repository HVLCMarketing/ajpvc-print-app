// Builds a print-ready PDF of every piece in an order and emails them to the marketing team.
// Called by the order form right after Netlify Forms accepts the order. Because the file name ends
// in "-background", Netlify answers 202 at once and lets this run for up to 15 minutes.
//
// Environment variables (Netlify: Site configuration → Environment variables):
//   RESEND_API_KEY    API key from resend.com (required to send)
//   ORDER_EMAIL_TO    who receives orders (default marketing@heartandleg.com); several addresses may be separated by commas
//   ORDER_EMAIL_FROM  sender on your verified domain, e.g. "AJPVC Print Orders <orders@vhpmd.com>"
//   ORDER_DRY_RUN     set to 1 to build the PDFs without sending (they are still saved for download)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { getStore } from '@netlify/blobs';

const MAX_ATTACH = 30 * 1024 * 1024;  // keep the email under Resend's 40 MB limit (attachments grow ~33% as base64)
const MAX_ITEMS = 40;
const MIN_QTY = 50;                   // print-shop minimum for any piece
const DEFAULT_TO = 'marketing@heartandleg.com';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let order;
  try { order = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
  if (order.company_website) return new Response(null, { status: 202 });   // the form's spam trap was filled in
  const items = (Array.isArray(order.items) ? order.items : []).filter((i) => i && /^[a-z0-9-]+$/.test(i.piece) && +i.qty > 0).slice(0, MAX_ITEMS);
  if (!items.length) return new Response('No items', { status: 400 });
  if (items.some((i) => +i.qty < MIN_QTY)) return new Response(`Minimum quantity is ${MIN_QTY} per piece`, { status: 400 });

  const site = process.env.URL || new URL(req.url).origin;
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
  const store = getStore({ name: 'order-pdfs' });
  const files = [];
  const failed = [];

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: process.env.CHROME_PATH || await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1400, height: 1000 }
  });
  try {
    const templates = await (await fetch(site + '/js/templates.js')).text();
    for (const it of items) {
      try {
        // a supplied, print-ready file (for example the poster PDF) is sent as-is
        const fileMatch = new RegExp(`"id":\\s*"${it.piece}"[^}]*?"pdf":\\s*"([^"]+)"`).exec(templates);
        let pdf;
        if (fileMatch) {
          pdf = Buffer.from(await (await fetch(new URL(fileMatch[1], site + '/'))).arrayBuffer());
        } else {
          const page = await browser.newPage();
          // the print page reads the location and business card from browser storage, so hand it this order's copies
          await page.evaluateOnNewDocument((loc, card) => {
            try {
              localStorage.setItem('ajpvc.locations.v1', JSON.stringify([loc]));
              localStorage.setItem('ajpvc.activeLocation.v1', loc.id);
              if (card) localStorage.setItem('ajpvc.card.v1', JSON.stringify(card));
            } catch (e) {}
          }, { id: 'order', ...(order.location || {}) }, order.card || null);
          // use this order's location, not the shared list, in case it changed since
          await page.setRequestInterception(true);
          page.on('request', (r) => (r.url().includes('/api/locations') ? r.respond({ status: 503, body: '' }) : r.continue()));
          // shop=1 builds the print-shop version: trim size + 1/8 in bleed + crop marks, vector text (wall art is left as is)
          await page.goto(`${site}/print.html?piece=${encodeURIComponent(it.piece)}&shop=1`, { waitUntil: 'networkidle0', timeout: 90000 });
          await page.waitForSelector('#printBtn:not([disabled])', { timeout: 90000 });
          pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
          await page.close();
        }
        const name = `${slug(it.label || it.piece)}_${slug(order.location?.city || order.location?.locationName)}_qty-${+it.qty}.pdf`;
        const key = `${id}/${name}`;
        await store.set(key, pdf, { metadata: { type: 'application/pdf' } });
        files.push({ ...it, name, key, size: pdf.length, pdf });
      } catch (e) {
        failed.push({ ...it, error: String(e.message || e).slice(0, 200) });
      }
    }
  } finally {
    await browser.close();
  }

  // attach what fits; everything also gets a download link that works for 90 days
  let used = 0;
  for (const f of files.sort((a, b) => a.size - b.size)) {
    f.attach = used + f.size <= MAX_ATTACH;
    if (f.attach) used += f.size;
  }
  const link = (f) => `${site}/.netlify/functions/order-file?key=${encodeURIComponent(f.key)}`;
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#4A5568;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  const loc = order.location || {};
  const attached = files.filter((f) => f.attach);
  const summary = (f) => `${f.name}: print ${(+f.qty).toLocaleString('en-US')}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1B2440;max-width:680px">
<h2 style="color:#16306E;margin:0 0 4px">Print order for the print shop</h2>
<p style="margin:0 0 16px;color:#4A5568">${esc(order.facility)} · ${esc(loc.locationName || '')}. Forward this email with its attachments.</p>
<p style="margin:0 0 6px"><b>Please print the attached files in these quantities:</b></p>
<table style="border-collapse:collapse;width:100%;margin-bottom:6px">
<tr style="background:#16306E;color:#fff"><th style="text-align:left;padding:6px 8px">Attachment</th><th style="text-align:right;padding:6px 8px">Quantity</th></tr>
${files.map((f) => `<tr style="border-bottom:1px solid #E2DED4"><td style="padding:6px 8px">${esc(f.name)}${f.attach ? '' : ' <span style="color:#C8231E">(too large to attach; <a href="' + link(f) + '">download</a>)</span>'}</td><td style="padding:6px 8px;text-align:right"><b>${esc((+f.qty).toLocaleString('en-US'))}</b></td></tr>`).join('')}
${failed.map((f) => `<tr style="border-bottom:1px solid #E2DED4"><td style="padding:6px 8px;color:#C8231E">${esc(f.label)}: PDF could not be built; print it from the app</td><td style="padding:6px 8px;text-align:right"><b>${esc(f.qty)}</b></td></tr>`).join('')}
</table>
<p style="margin:0 0 16px;color:#4A5568">Each file is the trim size plus 1/8 in bleed on every side, with crop marks on a slightly larger page. Two-sided pieces have the front on odd pages and the back on even pages. Supplied print-ready files (posters, sheets) are sent as designed.</p>
<h3 style="color:#16306E;margin:0 0 8px">Order details</h3>
<table style="border-collapse:collapse;margin-bottom:16px">
${row('Requested by', order.name)}${row('Email', order.email)}${row('Phone', order.phone)}${row('Needed by', order.needed_by)}
${row('Ship to', order.ship_to)}${row('Notes', order.notes)}${row('Location', order.location_details)}${row('Business cards', order.card_details)}
</table>
<p style="color:#4A5568">Download links for every file work for 90 days.${files.some((f) => !f.attach) ? ' Some files were too large to attach together; use the links above.' : ''}</p>
</div>`;
  const text = ['Please print the attached files in these quantities:', ...files.map(summary), ...failed.map((f) => `${f.label}: PDF could not be built; print it from the app: ${f.qty}`)].join('\n');

  if (process.env.ORDER_DRY_RUN === '1' || !process.env.RESEND_API_KEY) {
    console.log('Order PDFs built (not emailed):', id, files.map((f) => `${f.name} ${f.size}`), failed);
    if (process.env.ORDER_DRY_OUT) { const fs = await import('node:fs'); fs.writeFileSync(process.env.ORDER_DRY_OUT, html); }
    return new Response(null, { status: 202 });
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ORDER_EMAIL_FROM,
      to: String(process.env.ORDER_EMAIL_TO || DEFAULT_TO).split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: order.email || undefined,
      subject: `Print order: ${loc.locationName || order.facility || 'AJPVC'} (${items.length} item${items.length > 1 ? 's' : ''})`,
      html,
      text,
      attachments: files.filter((f) => f.attach).map((f) => ({ filename: f.name, content: f.pdf.toString('base64') }))
    })
  });
  if (!res.ok) console.error('Resend error', res.status, await res.text());
  return new Response(null, { status: 202 });
};
