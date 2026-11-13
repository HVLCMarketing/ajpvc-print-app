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
import { MIN_QTY, orderStore, pdfStore, nextNumber, saveOrder, addHistory, sendPrintEmail } from '../lib/orders.mjs';

const MAX_ITEMS = 40;
//
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
  const store = pdfStore();
  const ostore = orderStore();
  // the order record is created first, so the order shows up in the order manager while its PDFs are being built
  const loc = order.location || {};
  const rec = {
    id, number: await nextNumber(ostore), status: 'building', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    facility: order.facility || '', name: order.name || '', email: order.email || '', phone: order.phone || '',
    needed_by: order.needed_by || '', ship_to: order.ship_to || '', notes: order.notes || '',
    location: loc, location_details: order.location_details || '', card_details: order.card_details || '',
    items: items.map((i) => ({ piece: i.piece, label: i.label, qty: +i.qty })), history: [], internalNotes: [], tracking: {}, printShop: {}
  };
  addHistory(rec, { status: 'building', note: 'Order received; building print-shop PDFs.' });
  await saveOrder(ostore, rec);
  const files = [];
  const failed = [];

  let browser = null;
  try {
    browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: process.env.CHROME_PATH || await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1400, height: 1000 }
  });
  } catch (e) {
    for (const it of items) failed.push({ ...it, error: 'Could not start the PDF builder: ' + String(e.message || e).slice(0, 150) });
  }
  if (browser) try {
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

  // record the result, then email the print files to the marketing team
  rec.items = [
    ...files.map((f) => ({ piece: f.piece, label: f.label, qty: +f.qty, name: f.name, key: f.key, size: f.size })),
    ...failed.map((f) => ({ piece: f.piece, label: f.label, qty: +f.qty, error: f.error }))
  ];
  rec.status = 'new';
  addHistory(rec, { status: 'new', note: failed.length ? `PDFs ready, but ${failed.length} could not be built.` : 'PDFs ready.' });
  const sent = await sendPrintEmail(rec, site);
  rec.email_sent = sent.ok ? { ok: true, at: new Date().toISOString() } : { ok: false, error: sent.error || 'not sent' };
  if (!sent.ok) console.log('Order PDFs built (not emailed):', rec.number, sent.error);
  await saveOrder(ostore, rec);
  return new Response(null, { status: 202 });
};
