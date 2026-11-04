// Download link for an order's PDF: /.netlify/functions/order-file?key=<order id>/<file>.pdf
// Order ids start with the order's date and time; links stop working after 90 days.
import { getStore } from '@netlify/blobs';

const DAYS = 90;

export default async (req) => {
  const key = new URL(req.url).searchParams.get('key') || '';
  const m = /^(\d{4}-\d{2}-\d{2})T[\w-]+\/[a-z0-9-]+\.pdf$/.exec(key);
  if (!m) return new Response('Not found', { status: 404 });
  if (Date.now() - Date.parse(m[1]) > DAYS * 864e5) return new Response('This link has expired. Print the piece again from the app.', { status: 410 });
  const data = await getStore({ name: 'order-pdfs' }).get(key, { type: 'arrayBuffer' });
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${key.split('/')[1]}"`,
      'Cache-Control': 'private, max-age=3600'
    }
  });
};
