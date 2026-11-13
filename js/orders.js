(function () {
  const PASS_KEY = 'ajpvc.passcode.v1', NAME_KEY = 'ajpvc.orders.by.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUSES = [
    ['new', 'New'], ['sent', 'Sent to print shop'], ['production', 'In production'], ['shipped', 'Shipped'], ['delivered', 'Delivered']
  ];
  const LABEL = { building: 'Building PDFs', new: 'New', sent: 'Sent to print shop', production: 'In production', shipped: 'Shipped', delivered: 'Delivered', hold: 'On hold', cancelled: 'Cancelled' };
  const TILES = ['new', 'sent', 'production', 'shipped', 'delivered', 'hold'];
  let pass = '', orders = [], filterStatus = '', openId = '';
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  async function api(method, query = '', body) {
    const res = await fetch('/api/orders' + query, { method, headers: { 'x-edit-passcode': pass, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (res.status === 204) return null;
    let data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((data && data.error) || 'Request failed (' + res.status + ')'); err.status = res.status; throw err; }
    return data;
  }
  const date = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const dt = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const total = (o) => (o.items || []).reduce((s, i) => s + (+i.qty || 0), 0);
  const isOpen = (o) => !['delivered', 'cancelled'].includes(o.status);
  const isLate = (o) => isOpen(o) && o.needed_by && o.needed_by < new Date().toISOString().slice(0, 10);
  const hasIssue = (o) => (o.items || []).some((i) => i.error);
  const pill = (s) => `<span class="pill st-${s}">${esc(LABEL[s] || s)}</span>`;

  /* ---------- gate ---------- */
  function showGate(msg) { $('#app').hidden = true; $('#lockBtn').hidden = true; $('#gate').hidden = false; const e = $('#gateError'); e.hidden = !msg; e.textContent = msg || ''; }
  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault(); pass = $('#passInput').value.trim();
    try { await api('POST', '?check=1'); store.set(PASS_KEY, pass); start(); }
    catch (err) { pass = ''; showGate(err.status === 401 ? 'That passcode is not right.' : err.message); }
  });
  $('#lockBtn').addEventListener('click', () => { store.del(PASS_KEY); pass = ''; showGate(); });

  /* ---------- list ---------- */
  async function load() {
    try { orders = await api('GET'); } catch (err) { if (err.status === 401) { store.del(PASS_KEY); return showGate('The passcode changed. Enter it again.'); } $('#count').textContent = err.message; return; }
    const sel = $('#fLocation'), cur = sel.value;
    const locs = [...new Set(orders.map((o) => (o.location && o.location.locationName) || '').filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All locations</option>' + locs.map((l) => `<option>${esc(l)}</option>`).join(''); sel.value = locs.includes(cur) ? cur : '';
    render();
    if (openId) { const o = orders.find((x) => x.id === openId); if (o && !$('#drawer').hidden && !document.activeElement.closest('#panel')) openOrder(openId, true); }
  }
  function visible() {
    const q = $('#q').value.trim().toLowerCase(), loc = $('#fLocation').value, flag = $('#fFlag').value;
    return orders.filter((o) => {
      if (filterStatus === 'open' ? !isOpen(o) : filterStatus && o.status !== filterStatus) return false;
      if (loc && !(o.location && o.location.locationName === loc)) return false;
      if (flag === 'late' && !isLate(o)) return false;
      if (flag === 'issue' && !hasIssue(o)) return false;
      if (flag === 'noemail' && !(o.email_sent && o.email_sent.ok === false)) return false;
      if (q && ![o.number, o.name, o.email, o.facility, o.location && o.location.locationName, ...(o.items || []).map((i) => i.label)].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function render() {
    const counts = {}; orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    $('#tiles').innerHTML = `<button class="om-tile ${!filterStatus ? 'is-on' : ''}" data-s=""><b>${orders.length}</b><span>All orders</span></button>` +
      `<button class="om-tile ${filterStatus === 'open' ? 'is-on' : ''}" data-s="open"><b>${orders.filter(isOpen).length}</b><span>Open</span></button>` +
      TILES.map((s) => `<button class="om-tile ${filterStatus === s ? 'is-on' : ''}" data-s="${s}"><b>${counts[s] || 0}</b><span>${LABEL[s]}</span></button>`).join('');
    const list = visible();
    $('#count').textContent = `${list.length} order${list.length === 1 ? '' : 's'}`;
    $('#table tbody').innerHTML = list.map((o) => `<tr data-id="${esc(o.id)}">
      <td><span class="om-num">${esc(o.number)}</span></td><td>${esc(date(o.createdAt))}</td>
      <td>${esc((o.location && o.location.locationName) || '')}<span class="om-sub">${esc(o.facility)}</span></td>
      <td>${esc(o.name)}<span class="om-sub">${esc(o.email)}</span></td>
      <td>${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'}<span class="om-sub">${total(o).toLocaleString('en-US')} pieces</span></td>
      <td>${esc(o.needed_by || '')}${isLate(o) ? '<span class="flag">Late</span>' : ''}</td>
      <td>${pill(o.status)}${hasIssue(o) ? '<span class="flag">PDF issue</span>' : ''}${o.email_sent && o.email_sent.ok === false ? '<span class="flag">Email failed</span>' : ''}</td></tr>`).join('') ||
      '<tr><td colspan="7" class="muted" style="padding:24px">No orders match.</td></tr>';
  }
  $('#tiles').addEventListener('click', (e) => { const t = e.target.closest('.om-tile'); if (t) { filterStatus = t.dataset.s; render(); } });
  $('#table tbody').addEventListener('click', (e) => { const r = e.target.closest('tr[data-id]'); if (r) openOrder(r.dataset.id); });
  ['q', 'fLocation', 'fFlag'].forEach((id) => $('#' + id).addEventListener('input', render));
  $('#refresh').addEventListener('click', load);

  /* ---------- detail ---------- */
  const trackLink = (t) => {
    if (!t || !t.number) return '';
    const u = { UPS: 'https://www.ups.com/track?tracknum=', FedEx: 'https://www.fedex.com/fedextrack/?trknbr=', USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' }[t.carrier];
    return u ? u + encodeURIComponent(t.number) : '';
  };
  function openOrder(id, keepScroll) {
    const o = orders.find((x) => x.id === id); if (!o) return;
    openId = id;
    const panel = $('#panel'), scroll = panel.scrollTop;
    const idx = STATUSES.findIndex((s) => s[0] === o.status);
    const next = idx >= 0 && idx < STATUSES.length - 1 ? STATUSES[idx + 1] : null;
    const t = o.tracking || {}, ps = o.printShop || {}, link = trackLink(t);
    panel.innerHTML = `
      <div class="om-head"><div><h2>${esc(o.number)} ${pill(o.status)}</h2><p class="muted">${esc(o.facility)} · ${esc((o.location && o.location.locationName) || '')} · placed ${esc(dt(o.createdAt))}</p></div><button class="btn ghost" id="closeP" type="button">Close</button></div>

      <div class="om-section"><h3>Status</h3>
        <div class="om-steps">${STATUSES.map((s, i) => `<span class="om-step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}">${esc(s[1])}</span>`).join('')}${['hold', 'cancelled'].includes(o.status) ? pill(o.status) : ''}</div>
        <label>Note <span class="hint">added to the history${o.email ? '; sent to the requester if you tick the box' : ''}</span><textarea id="nNote" rows="2" placeholder="Optional"></textarea></label>
        <label class="om-check"><input type="checkbox" id="nNotify" ${o.email ? '' : 'disabled'}> Email ${esc(o.name || 'the requester')} about this change</label>
        <div class="row">
          ${next && o.status !== 'building' ? `<button class="btn primary" data-go="${next[0]}" type="button">Mark ${esc(next[1].toLowerCase())}</button>` : ''}
          <select id="nOther" aria-label="Set another status"><option value="">Set another status…</option>${Object.keys(LABEL).filter((k) => k !== 'building' && k !== o.status).map((k) => `<option value="${k}">${esc(LABEL[k])}</option>`).join('')}</select>
          <button class="btn ghost" id="nSetOther" type="button">Apply</button>
        </div>
      </div>

      <div class="om-section"><h3>Print files and quantities</h3>
        <table class="om-items"><thead><tr><th>Piece</th><th>File</th><th class="num">Qty</th></tr></thead><tbody>
        ${(o.items || []).map((i) => `<tr><td>${esc(i.label)}</td><td>${i.key ? `<a href="/.netlify/functions/order-file?key=${encodeURIComponent(i.key)}">${esc(i.name)}</a><span class="om-sub">${(i.size / 1048576).toFixed(1)} MB</span>` : `<span class="om-bad">${o.status === 'building' ? 'Building…' : 'PDF could not be built. Print it from the app.'}</span>`}</td><td class="num"><b>${(+i.qty).toLocaleString('en-US')}</b></td></tr>`).join('')}
        <tr><td colspan="2"><b>Total pieces</b></td><td class="num"><b>${total(o).toLocaleString('en-US')}</b></td></tr></tbody></table>
        <p class="om-note">PDF links work for 90 days from the order date. Email to marketing: ${o.email_sent ? (o.email_sent.ok ? `<span class="om-ok">sent ${esc(dt(o.email_sent.at))}</span>` : `<span class="om-bad">not sent (${esc(o.email_sent.error || '')})</span>`) : 'pending'}</p>
        <div class="row"><button class="btn ghost" id="resend" type="button" ${o.items && o.items.some((i) => i.key) ? '' : 'disabled'}>Email print files to marketing again</button></div>
      </div>

      <div class="om-section"><h3>Print shop</h3>
        <div class="om-grid">
          <label>Print shop <input id="psName" value="${esc(ps.name || '')}" placeholder="Shop name"></label>
          <label>PO / job number <input id="psPo" value="${esc(ps.po || '')}"></label>
          <label>Quote ($) <input id="psQuote" value="${esc(ps.quote || '')}" inputmode="decimal"></label>
        </div>
        ${ps.sentAt ? `<p class="om-note">Sent to the print shop ${esc(dt(ps.sentAt))}</p>` : ''}
      </div>

      <div class="om-section"><h3>Shipping</h3>
        <div class="om-grid">
          <label>Carrier <select id="trCarrier">${['', 'UPS', 'FedEx', 'USPS', 'Other'].map((c) => `<option value="${c}" ${t.carrier === c || (!t.carrier && !c) ? 'selected' : ''}>${c || 'Choose…'}</option>`).join('')}</select></label>
          <label>Tracking number <input id="trNum" value="${esc(t.number || '')}"></label>
          <label>Expected delivery <input id="trEta" type="date" value="${esc(t.eta || '')}"></label>
        </div>
        <div class="row"><button class="btn ghost" id="saveShip" type="button">Save print shop and shipping</button>${link ? `<a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener">Track package</a>` : ''}</div>
        <div class="om-kv"><small>Ship to</small>${esc(o.ship_to).replace(/\n/g, '<br>')}</div>
        <label>Needed by <input id="nNeeded" type="date" value="${esc(o.needed_by || '')}"></label>
      </div>

      <div class="om-section"><h3>Requester</h3>
        <div class="om-grid">
          <div class="om-kv"><small>Name</small>${esc(o.name)}</div>
          <div class="om-kv"><small>Email</small>${o.email ? `<a href="mailto:${esc(o.email)}?subject=${encodeURIComponent('Your print order ' + o.number)}">${esc(o.email)}</a>` : ''}</div>
          <div class="om-kv"><small>Phone</small>${esc(o.phone || '')}</div>
        </div>
        ${o.notes ? `<div class="om-kv"><small>Order notes</small>${esc(o.notes).replace(/\n/g, '<br>')}</div>` : ''}
        ${o.card_details ? `<div class="om-kv"><small>Business cards</small>${esc(o.card_details).replace(/\n/g, '<br>')}</div>` : ''}
      </div>

      <div class="om-section"><h3>History</h3>
        <ul class="om-hist">${(o.history || []).slice().reverse().map((h) => `<li><span>${h.status ? pill(h.status) + ' ' : ''}${esc(h.note || '')}</span><small>${esc(dt(h.at))}${h.by ? ' · ' + esc(h.by) : ''}</small></li>`).join('')}</ul>
      </div>`;
    $('#drawer').hidden = false; document.body.style.overflow = 'hidden';
    panel.scrollTop = keepScroll ? scroll : 0;
  }
  const closeDrawer = () => { $('#drawer').hidden = true; document.body.style.overflow = ''; openId = ''; };
  $('#drawerBg').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });

  async function patch(body, okMsg) {
    const by = store.get(NAME_KEY) || (() => { const n = (prompt('Your name, for the history log:') || '').trim(); if (n) store.set(NAME_KEY, n); return n; })();
    try {
      const upd = await api('PATCH', '?id=' + encodeURIComponent(openId), { ...body, by });
      const i = orders.findIndex((x) => x.id === upd.id); if (i >= 0) orders[i] = upd;
      render(); openOrder(upd.id, true);
    } catch (err) { alert(err.status === 401 ? 'The passcode is no longer valid. Reload and enter it again.' : err.message); }
  }
  $('#panel').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const note = ($('#nNote') || {}).value || '', notify = !!($('#nNotify') || {}).checked;
    if (b.id === 'closeP') return closeDrawer();
    if (b.dataset.go) return patch({ status: b.dataset.go, note, notify });
    if (b.id === 'nSetOther') { const v = $('#nOther').value; if (v) patch({ status: v, note, notify }); return; }
    if (b.id === 'saveShip') return patch({
      printShop: { name: $('#psName').value, po: $('#psPo').value, quote: $('#psQuote').value },
      tracking: { carrier: $('#trCarrier').value, number: $('#trNum').value, eta: $('#trEta').value },
      needed_by: $('#nNeeded').value
    });
    if (b.id === 'resend') {
      if (!confirm('Email the print files for this order to marketing again?')) return;
      b.disabled = true;
      try { const upd = await api('POST', '?id=' + encodeURIComponent(openId) + '&action=resend'); const i = orders.findIndex((x) => x.id === upd.id); if (i >= 0) orders[i] = upd; render(); openOrder(upd.id, true); }
      catch (err) { alert(err.message); b.disabled = false; }
    }
  });

  function start() { $('#gate').hidden = true; $('#app').hidden = false; $('#lockBtn').hidden = false; load(); }
  pass = store.get(PASS_KEY);
  if (pass) api('POST', '?check=1').then(start).catch((err) => { pass = ''; store.del(PASS_KEY); showGate(err.status === 401 ? 'The passcode changed. Enter it again.' : err.message); });
  else showGate();
  setInterval(() => { if (pass && !document.hidden && $('#drawer').hidden) load(); }, 60000);
})();
