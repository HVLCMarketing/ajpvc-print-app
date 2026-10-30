(function () {
  const A = window.AJPVC;
  const T = window.AJPVC_TEMPLATES;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const API = '/api/locations';
  const PASS_KEY = 'ajpvc.passcode.v1';

  let locations = [];
  let activeId = A.getActiveId();
  let shared = false;          // true when the site's shared location list is reachable
  let canEdit = false;
  let passcode = '';
  try { passcode = localStorage.getItem(PASS_KEY) || ''; } catch (e) {}
  const pending = new Map();   // id -> timer for debounced saves
  let localOnly = [];          // locations found in this browser that aren't in the shared list

  const uid = () => 'loc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = () => ({ id: uid(), locationName: 'New location', street: '', city: '', state: 'CA', zip: '', hours: '', map: '', providerName: '', providerTitle: '', providerPhoto: '', openHouseDate: '', openHouseTime: '', talkDate: '', talkVenue: '' });
  const active = () => locations.find((l) => l.id === activeId);
  const status = (msg, warn) => { const s = $('#saveState'); s.textContent = msg; s.classList.toggle('warn', !!warn); };

  /* ---------- tabs ---------- */
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('.tab-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + b.dataset.tab; });
    if (b.dataset.tab === 'order') fillOrderLocations();
    else if (b.dataset.tab === 'landing') renderLanding();
    else if (b.dataset.tab === 'gbp') renderGbp();
    else if (b.dataset.tab === 'cards') renderCard();
    else layoutAll();
  }));

  /* ---------- shared storage ---------- */
  async function api(method, body, query = '') {
    const res = await fetch(API + query, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-edit-passcode': passcode },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Request failed (' + res.status + ')'); e.status = res.status; throw e; }
    return data;
  }

  function cacheLocally() { A.saveLocations(locations); }

  function queueSave(loc) {
    if (!shared) { cacheLocally(); status('Saved in this browser only.'); return; }
    clearTimeout(pending.get(loc.id));
    status('Saving…');
    pending.set(loc.id, setTimeout(async () => {
      pending.delete(loc.id);
      try { await api('PUT', loc); cacheLocally(); if (!pending.size) status('Saved to the shared list. Everyone sees this.'); }
      catch (err) { handleEditError(err); }
    }, 700));
  }

  function handleEditError(err) {
    if (err.status === 401) { lock(); status('Wrong or expired passcode. Unlock editing again.', true); }
    else status('Not saved: ' + err.message, true);
  }

  async function loadShared() {
    try {
      const list = await api('GET');
      shared = true;
      return list.map((l) => ({ ...blank(), ...l }));
    } catch (e) { shared = false; return null; }
  }

  /* ---------- edit lock ---------- */
  function setEditable(on) {
    canEdit = on;
    $('#editFields').disabled = !on;
    $('#newLoc').disabled = !on;
    renderLockBar();
    if (on && !locations.length && !localOnly.length) addLocation();
  }
  function lock() { passcode = ''; try { localStorage.removeItem(PASS_KEY); } catch (e) {} setEditable(!shared); }

  function renderLockBar() {
    const bar = $('#lockBar');
    if (!shared) {
      bar.innerHTML = '<p class="hint warn">Shared list unavailable here, so changes are saved in this browser only.</p>';
      return;
    }
    const upload = canEdit && localOnly.length
      ? `<button type="button" class="btn ghost" id="uploadLocal">Add ${localOnly.length} location${localOnly.length > 1 ? 's' : ''} from this browser to the shared list</button>` : '';
    bar.innerHTML = canEdit
      ? `<p class="lock-state unlocked">Editing the shared list</p><button type="button" class="btn ghost" id="lockBtn">Lock</button>${upload}`
      : `<p class="lock-state">View only. Anyone can print and order.</p><button type="button" class="btn primary" id="unlockBtn">Unlock editing</button>`;
    const u = $('#unlockBtn'); if (u) u.addEventListener('click', unlock);
    const l = $('#lockBtn'); if (l) l.addEventListener('click', () => { lock(); status('Editing locked.'); });
    const up = $('#uploadLocal'); if (up) up.addEventListener('click', uploadLocal);
  }

  async function unlock() {
    const code = prompt('Team passcode to edit locations:');
    if (!code) return;
    passcode = code.trim();
    try {
      await api('POST', null, '?check=1');
      try { localStorage.setItem(PASS_KEY, passcode); } catch (e) {}
      setEditable(true); status('Editing unlocked on this device.');
    } catch (err) { passcode = ''; status(err.status === 401 ? 'That passcode is not right.' : err.message, true); }
  }

  async function uploadLocal() {
    status('Adding locations…');
    try {
      for (const loc of localOnly) { await api('PUT', loc); locations.push(loc); }
      localOnly = [];
      cacheLocally(); refreshPicker(); renderLockBar(); renderAll();
      status('Added to the shared list.');
    } catch (err) { handleEditError(err); }
  }

  /* ---------- location form ---------- */
  function refreshPicker() {
    const sel = $('#locSelect');
    sel.innerHTML = locations.length
      ? locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('')
      : '<option value="">No locations yet</option>';
    sel.value = activeId || '';
  }

  function loadForm() {
    const loc = active() || {};
    const f = $('#locForm');
    ['locationName', 'street', 'city', 'state', 'zip', 'hours', 'providerName', 'providerTitle', 'openHouseDate', 'openHouseTime', 'talkDate', 'talkVenue']
      .forEach((k) => { f.elements[k].value = loc[k] || ''; });
    showMap();
  }

  function showMap() {
    const loc = active() || {};
    $('#providerPreview').innerHTML = loc.providerPhoto ? `<img src="${loc.providerPhoto}" alt="Uploaded provider photo">` : '<span>No photo yet</span>';
  }

  $('#locForm').addEventListener('input', (e) => {
    const loc = active();
    if (!loc || !canEdit || !e.target.name || !(e.target.name in loc)) return;
    loc[e.target.name] = e.target.value;
    queueSave(loc);
    if (e.target.name === 'locationName') refreshPicker();
    renderAll();
  });

  $('#locSelect').addEventListener('change', (e) => {
    activeId = e.target.value; A.setActiveId(activeId); loadForm(); renderAll();
  });

  function addLocation() {
    const loc = blank(); locations.push(loc); activeId = loc.id; A.setActiveId(activeId);
    queueSave(loc); refreshPicker(); loadForm(); renderAll();
    $('#locForm').elements.locationName.select();
  }
  $('#newLoc').addEventListener('click', () => { if (canEdit) addLocation(); });

  $('#deleteLoc').addEventListener('click', async () => {
    const loc = active();
    if (!loc || !canEdit || !confirm(`Delete "${loc.locationName}"${shared ? ' for everyone' : ''}?`)) return;
    try {
      if (shared) { clearTimeout(pending.get(loc.id)); pending.delete(loc.id); await api('DELETE', null, '?id=' + encodeURIComponent(loc.id)); }
      locations = locations.filter((l) => l.id !== loc.id);
      activeId = locations[0] ? locations[0].id : ''; A.setActiveId(activeId);
      cacheLocally(); refreshPicker(); loadForm(); renderAll();
      status('Location deleted.');
    } catch (err) { handleEditError(err); }
  });

  // provider photo: keep the whole picture, just scaled down
  $('#providerFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file || !active() || !canEdit) return;
    const img = new Image();
    img.onload = () => {
      const max = 1000, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      active().providerPhoto = c.toDataURL('image/jpeg', 0.88);
      URL.revokeObjectURL(img.src);
      queueSave(active()); showMap(); renderAll();
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); alert('That image could not be read. Try a JPEG or PNG file.'); };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  });
  $('#clearProvider').addEventListener('click', () => { if (!active() || !canEdit) return; active().providerPhoto = ''; queueSave(active()); showMap(); renderAll(); });

  $('#exportLocs').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(locations, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ajpvc-locations.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importLocs').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file || !canEdit) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('not a list');
      for (const d of data) {
        if (!d || typeof d !== 'object') continue;
        const loc = { ...blank(), ...d, id: d.id || uid() };
        const i = locations.findIndex((l) => l.id === loc.id);
        if (i >= 0) locations[i] = loc; else locations.push(loc);
        if (shared) await api('PUT', loc);
      }
      if (!active() && locations[0]) activeId = locations[0].id;
      cacheLocally(); refreshPicker(); loadForm(); renderAll();
      status(shared ? 'Imported into the shared list.' : 'Imported in this browser.');
    } catch (err) { err.status ? handleEditError(err) : alert('That file is not a locations export.'); }
    e.target.value = '';
  });

  // pick up other people's changes when you come back to the tab
  window.addEventListener('focus', async () => {
    if (!shared || pending.size) return;
    const list = await loadShared();
    if (!list) return;
    locations = list;
    if (!active()) activeId = locations[0] ? locations[0].id : '';
    cacheLocally(); refreshPicker(); loadForm(); renderAll();
  });

  /* ---------- gallery ---------- */
  // piece picker: view one piece at a time or all of them (remembered per browser, or ?piece=id in the URL)
  // facility switcher: AJPVC and HVLC each get their own set of pieces (?facility=hvlc in the URL, or remembered per browser)
  const FACILITIES = {
    ajpvc: { name: 'Advanced Joint Pain & Vascular Center', short: 'AJPVC', logo: 'assets/logo-long-transparent.png' },
    hvlc: { name: 'Heart Vascular & Leg Center', short: 'HVLC', logo: 'assets/logo-hvlc.png' }
  };
  const GROUP_ORDER = ['Marketing materials', 'Folders', 'Patient guides', 'Newsletters', 'Posters', 'Waiting room art', 'Referral materials'];
  const gIdx = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  const byGroup = (a, b) => gIdx(a.group) - gIdx(b.group);
  const FAC_KEY = 'ajpvc.facility.v1';
  const FILTER_KEY = 'ajpvc.pieceFilter.v1';
  const params = new URLSearchParams(location.search);
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const facOf = (id) => (T.find((p) => p.id === id) || {}).facility;

  let pieceFilter = params.get('piece') || read(FILTER_KEY);
  let facility = params.get('facility') || read(FAC_KEY) || facOf(params.get('piece'));
  if (!FACILITIES[facility]) facility = 'ajpvc';
  const facSel = $('#facility'), filterSel = $('#pieceFilter');

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set('facility', facility);
    if (pieceFilter === 'all') u.searchParams.delete('piece'); else u.searchParams.set('piece', pieceFilter);
    history.replaceState(null, '', u);
  }

  function applyFacility() {
    const f = FACILITIES[facility];
    facSel.value = facility;
    $('#facilityLogo').src = f.logo; $('#facilityLogo').alt = f.name;
    document.title = f.short + ' Print Materials';
    document.body.dataset.facility = facility;
    const forFac = (p) => p.facility === facility || p.facility === 'both';
    const mine = T.filter((p) => forFac(p) && p.kind !== 'card' && p.kind !== 'web').sort(byGroup);
    const groups = [...new Set(mine.map((p) => p.group))];
    filterSel.innerHTML = '<option value="all">All pieces</option>' + groups.map((g) => `<optgroup label="${A.esc(g)}">` +
      mine.filter((p) => p.group === g).map((p) => `<option value="${p.id}">${A.esc(p.title)}</option>`).join('') + '</optgroup>').join('') +
      groups.map((g) => `<option value="group:${A.esc(g)}">All ${A.esc(g.toLowerCase())}</option>`).join('');
    if (!mine.some((p) => p.id === pieceFilter || 'group:' + p.group === pieceFilter)) pieceFilter = 'all';
    filterSel.value = pieceFilter;
    // order form: only this facility's items; clear the others so they aren't ordered by mistake
    $$('#qtyGrid [data-facility]').forEach((l) => {
      const on = l.dataset.facility === facility || l.dataset.facility === 'both';
      l.hidden = !on;
      if (!on) l.querySelector('input').value = 0;
    });
    if ($('#qtyGrid').dataset.built) { syncOrderGroups(); renderOrderThumbs(); }
    $$('.tab[data-only]').forEach((t) => {
      t.hidden = t.dataset.only !== facility;
      if (t.hidden && t.classList.contains('is-active')) $('.tab[data-tab="materials"]').click();
    });
    if (!$('#tab-gbp').hidden) renderGbp();
    $('#orderFacility').value = f.name;
    syncUrl();
  }

  facSel.addEventListener('change', () => {
    facility = facSel.value; write(FAC_KEY, facility);
    pieceFilter = 'all'; write(FILTER_KEY, pieceFilter);
    applyFacility(); renderAll(); renderCard();
  });
  filterSel.addEventListener('change', () => {
    pieceFilter = filterSel.value; write(FILTER_KEY, pieceFilter);
    syncUrl(); renderAll();
  });
  applyFacility();

  function renderAll() {
    const loc = active();
    const host = $('#pieces');
    const shown = T.filter((p) => p.kind !== 'card' && p.kind !== 'web' && (p.facility === facility || p.facility === 'both') && (pieceFilter === 'all' || p.id === pieceFilter || 'group:' + p.group === pieceFilter)).sort(byGroup);
    let lastGroup = null;
    host.innerHTML = shown.map((p) => {
      if (p.kind === 'file') {
        const head = p.group !== lastGroup ? `<h2 class="group-head">${A.esc(p.group)}</h2>` : ''; lastGroup = p.group;
        return head + `<article class="piece" data-id="${p.id}">
        <header class="piece-head">
          <div><h3>${A.esc(p.title)}</h3><p class="muted">${A.esc(p.size)}</p></div>
          <div class="piece-actions">
            <span class="badge badge-ok">Print-ready file</span>
            <a class="btn primary" href="${p.pdf}" download>Download PDF</a>
          </div>
        </header>
        <figure class="page file-preview"><a href="${p.pdf}" target="_blank" rel="noopener"><img src="${p.preview}" alt="Preview of ${A.esc(p.title)}" loading="lazy"></a>
        <figcaption>Finished design supplied as a PDF. Send it to the printer as-is.</figcaption></figure>
      </article>`;
      }
      const pages = p.pages.map((pg) => ({ ...pg, filled: A.fill(pg.html, loc) }));
      const n = pages.reduce((s, pg) => s + A.countPlaceholders(pg.filled), 0);
      const heading = p.group !== lastGroup ? `<h2 class="group-head">${A.esc(p.group)}</h2>` : ''; lastGroup = p.group;
      return heading + `<article class="piece" data-id="${p.id}">
        <header class="piece-head">
          <div><h3>${A.esc(p.title)}</h3><p class="muted">${A.esc(p.size)}</p></div>
          <div class="piece-actions">
            <span class="badge ${n ? 'badge-warn' : 'badge-ok'}">${n ? n + ' placeholder' + (n > 1 ? 's' : '') + ' left' : 'Ready to print'}</span>
            <a class="btn primary" href="print.html?piece=${p.id}" target="_blank" rel="noopener">Print / PDF</a>
          </div>
        </header>
        <div class="pages">${pages.map((pg) => `
          <figure class="page"><div class="page-frame" data-w="${pg.w}" data-h="${pg.h}"><div class="sheet" style="width:${pg.w}px;height:${pg.h}px">${pg.filled}</div></div>
          <figcaption>${A.esc(pg.label)}</figcaption></figure>`).join('')}
        </div>
      </article>`;
    }).join('');
    layoutAll();
  }

  function layoutAll() {
    $$('.page-frame').forEach((f) => {
      const w = +f.dataset.w, h = +f.dataset.h, cw = f.clientWidth;
      if (!cw) return;
      const s = cw / w;
      f.style.height = Math.round(h * s) + 'px';
      f.firstElementChild.style.transform = `scale(${s})`;
    });
  }
  new ResizeObserver(() => layoutAll()).observe(document.body);

  /* ---------- business cards ---------- */
  // one person's card, saved in this browser; the print page reads the same key
  const CARD_KEY = 'ajpvc.card.v1';
  const MAIN_OFFICE = { id: 'main', locationName: 'Bakersfield (Main)', street: '5020 Commerce Drive', city: 'Bakersfield', state: 'CA', zip: '93309' };
  let card = {};
  try { card = JSON.parse(localStorage.getItem(CARD_KEY)) || {}; } catch (e) {}
  const cardPiece = () => T.find((p) => p.id === 'card-' + facility);
  const offices = () => [MAIN_OFFICE, ...locations.filter((l) => l.street)];
  function saveCard() {
    const o = offices().find((x) => x.id === card.officeId) || MAIN_OFFICE;
    card.office = { locationName: o.locationName, street: o.street, city: o.city, state: o.state, zip: o.zip };
    write(CARD_KEY, JSON.stringify(card));
  }
  function renderCard() {
    const f = $('#cardForm'), sel = $('#cardOffice');
    sel.innerHTML = offices().map((o) => `<option value="${A.esc(o.id)}">${A.esc(o.locationName || 'Untitled')} · ${A.esc([o.street, o.city].filter(Boolean).join(', '))}</option>`).join('');
    if (!offices().some((o) => o.id === card.officeId)) card.officeId = 'main';
    sel.value = card.officeId;
    ['name', 'title', 'direct', 'cell', 'email'].forEach((k) => { if (document.activeElement !== f.elements[k]) f.elements[k].value = card[k] || ''; });
    $('#cardPhotoClear').hidden = !card.photo;
    saveCard();
    const p = cardPiece(); if (!p) return;
    $('#cardTitle').textContent = p.title;
    $('#cardPrint').href = 'print.html?piece=' + p.id;
    const extra = A.cardValues(card);
    $('#cardPreview').innerHTML = '<div class="card-pages">' + p.pages.map((pg) =>
      `<figure class="page"><div class="page-frame" data-w="${pg.w}" data-h="${pg.h}"><div class="sheet" style="width:${pg.w}px;height:${pg.h}px">${A.fill(pg.html, card.office, extra)}</div></div><figcaption>${A.esc(pg.label)}</figcaption></figure>`).join('') + '</div>';
    layoutAll();
  }
  // shrink a chosen photo to a small square JPEG so it fits in browser storage and prints sharply at card size
  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight), out = 360;
        const c = document.createElement('canvas'); c.width = c.height = out;
        // crop to a centred square, biased toward the top where the face usually is
        const sx = (img.naturalWidth - side) / 2, sy = Math.max(0, (img.naturalHeight - side) * 0.2);
        c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  $('#cardForm').addEventListener('input', (e) => {
    const k = e.target.name; if (!k || k === 'photo') return;
    if (k === 'office') card.officeId = e.target.value; else card[k] = e.target.value;
    renderCard();
  });
  $('#cardPhoto').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { card.photo = await loadPhoto(file); } catch (x) { alert('That image could not be read. Try a JPEG or PNG file.'); }
    e.target.value = '';
    renderCard();
  });
  $('#cardPhotoClear').addEventListener('click', () => { delete card.photo; renderCard(); });
  $('#cardOrder').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="order"]').click();
    const q = document.querySelector('#qtyGrid input[name="qty_business_cards"]');
    if (q) { if (!+q.value) q.value = 1; q.focus(); }
  });
  function cardDetails() {
    const o = card.office || {};
    return [`Card style: ${cardPiece() ? cardPiece().title : ''}`, `Name: ${card.name || ''}`, `Title: ${card.title || ''}`, `Direct: ${card.direct || ''}`,
      `Cell: ${card.cell || ''}`, `Email: ${card.email || ''}`, `Office: ${[o.street, [o.city, o.state].filter(Boolean).join(', '), o.zip].filter(Boolean).join(' ')}`,
      `Photo: ${card.photo ? 'attached (card_photo)' : 'none'}`].join('\n');
  }

  /* ---------- landing pages ---------- */
  // a finished, self-contained web page for one location: the same design as the canvas, filled in
  function landingHtml(loc) {
    const p = T.find((x) => x.id === 'landing'); if (!p) return { html: '', left: 0 };
    let body = A.fill(p.pages[0].html, loc);
    const left = A.countPlaceholders(body);
    body = body.replace(/<mark class="ph">([\s\S]*?)<\/mark>/g, '$1')      // plain text in the exported code
      .replace(/(src=")assets\//g, '$1' + location.origin + '/assets/');    // images load from this site
    const v = A.values(loc), city = v.CITY || 'your area';
    const title = `Joint pain treatment in ${city} | Advanced Joint Pain & Vascular Center`;
    const desc = `Minimally invasive, image-guided care for knee, hip, shoulder, hand and heel pain at ${v.LOCATION_NAME || 'Advanced Joint Pain & Vascular Center'}${v.FULL_ADDRESS ? ', ' + v.FULL_ADDRESS : ''}. Call 661-324-4100.`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${A.esc(title)}</title>
<meta name="description" content="${A.esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Public+Sans:wght@400;600&display=swap">
<style>
body { margin: 0; }
a { color: #16306E; } a:hover { color: #C8231E; }
img { max-width: 100%; }
@media (max-width: 640px) { h1 { font-size: 36px !important; } h2 { font-size: 28px !important; } section > div { padding-top: 48px !important; padding-bottom: 48px !important; } }
</style>
</head>
<body>
<!-- Location landing page: ${A.esc(v.LOCATION_NAME || 'Untitled location')}. Generated by the AJPVC print app. -->
${body}
</body>
</html>
`;
    return { html, left };
  }
  function fileSlug(loc) { return 'ajpvc-' + ((A.values(loc).CITY || A.values(loc).LOCATION_NAME || 'location').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) + '.html'; }
  let landingW = 1280;
  function renderLanding() {
    const sel = $('#landingLocation');
    const keep = sel.value || activeId;
    sel.innerHTML = locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('');
    sel.value = locations.some((l) => l.id === keep) ? keep : (locations[0] || {}).id || '';
    const loc = locations.find((l) => l.id === sel.value) || {};
    const { html, left } = landingHtml(loc);
    $('#landingCode').value = html;
    const w = $('#landingWarn');
    w.hidden = !left;
    w.textContent = left ? `${left} detail${left > 1 ? 's are' : ' is'} still missing for this location (for example the featured provider, address or hours). Fill them in on the Location materials tab; the code shows the bracketed placeholder until then.` : '';
    const f = $('#landingFrame');
    f.srcdoc = html.replace(/<form /, '<form onsubmit="return false" ');
    f.style.width = landingW + 'px';
    f.onload = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) {} layoutLanding(); };
  }
  function layoutLanding() {
    const box = $('.landing-frame'), f = $('#landingFrame'); if (!box.clientWidth) return;
    const sc = Math.min(1, box.clientWidth / landingW);
    f.style.transform = `scale(${sc})`;
    box.style.height = Math.round((parseFloat(f.style.height) || 2000) * sc) + 'px';
  }
  new ResizeObserver(() => layoutLanding()).observe($('.landing-frame'));
  $('#landingLocation').addEventListener('change', renderLanding);
  $$('.landing-preview .seg button').forEach((b) => b.addEventListener('click', () => {
    $$('.landing-preview .seg button').forEach((x) => x.classList.toggle('is-on', x === b));
    landingW = +b.dataset.w; renderLanding();
  }));
  $('#landingCopy').addEventListener('click', async () => {
    const t = $('#landingCode'), b = $('#landingCopy');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy code'; }, 1600);
  });
  $('#landingDownload').addEventListener('click', () => {
    const loc = locations.find((l) => l.id === $('#landingLocation').value) || {};
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$('#landingCode').value], { type: 'text/html' }));
    a.download = fileSlug(loc); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------- Google Business Profiles ---------- */
  const G = window.AJPVC_GBP;
  // one copyable box: label, editable text, live character count against Google's limit
  function gbpField(label, value, opts = {}) {
    const rows = opts.rows || (value.length > 160 ? Math.min(9, Math.ceil(value.length / 85) + 1) : 1);
    const lim = opts.limit ? `<span class="gbp-count" data-limit="${opts.limit}"></span>` : '';
    const tag = rows > 1 ? `<textarea rows="${rows}">${A.esc(value)}</textarea>` : `<input value="${A.esc(value)}">`;
    return `<div class="gbp-field"><div class="gbp-label"><span>${label}</span>${lim}<button type="button" class="btn ghost small gbp-copy">Copy</button></div>${tag}${opts.note ? `<p class="muted small">${opts.note}</p>` : ''}</div>`;
  }
  function gbpFill(t, loc, extra = {}) {
    const v = A.values(loc);
    const map = Object.assign({ CITY: v.CITY || '[CITY]', LOCATION: v.LOCATION_NAME || '[LOCATION NAME]', ADDRESS: v.FULL_ADDRESS || '[ADDRESS]', HOURS: v.HOURS || '[HOURS]', FACILITY: G.facilities[facility].name }, extra);
    return t.replace(/\{([A-Z]+)\}/g, (m, k) => (k in map ? map[k] : m));
  }
  function renderGbp() {
    const sel = $('#gbpLocation'), keep = sel.value || activeId;
    sel.innerHTML = locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('');
    sel.value = locations.some((l) => l.id === keep) ? keep : (locations[0] || {}).id || '';
    const loc = locations.find((l) => l.id === sel.value) || {}, v = A.values(loc), F = G.facilities[facility];
    $('#gbpFacName').textContent = F.name;
    const X = F.fixed || {};
    const addr = X.address || v.FULL_ADDRESS || '[ADDRESS]', hours = X.hours || v.HOURS || '[HOURS]';
    $('#gbpBusiness').innerHTML = `<h2>Business profile: ${A.esc(F.name)}</h2>
      ${X.address ? '<p class="muted small">Official name, address, phone and hours from the project hub. Use them exactly the same everywhere: Google, directories, the website and Zoho.</p>' : ''}
      <div class="gbp-grid">
      ${gbpField('Business name', F.name, { note: 'Use the name exactly as it appears on the sign. Google does not allow adding the city or keywords to the name.' })}
      ${gbpField('Primary category', F.categories.primary, { note: X.address ? 'Never use “Vascular surgeon”: no one at HVLC is a surgeon.' : 'Suggested. Pick the closest match in Google’s category list.' })}
      ${gbpField('Additional categories', F.categories.additional.join(', '), { note: 'Only add categories Google offers that describe services you actually provide.' })}
      ${gbpField('Phone', X.phone || '661-324-4100')}
      ${gbpField('Website', 'https://heartandleg.com', { note: 'The homepage, not a provider page.' })}
      ${gbpField('Address', addr)}
      ${gbpField('Hours', hours, { note: 'Google asks for hours day by day; enter them from this line.' })}
      ${X.appointment ? gbpField('Appointment link', X.appointment) : ''}
      ${X.opening ? gbpField('Opening date', X.opening) : ''}
      ${X.social ? gbpField('Social profiles', X.social) : ''}
      </div>
      ${gbpField('Business description', gbpFill(F.description, loc), { limit: 750, note: 'Google allows up to 750 characters. Leave out phone numbers and links.' })}
      <h3>Services</h3><div class="gbp-grid">${F.services.map(([n, d]) => gbpField(A.esc(n), d, { limit: 300, rows: 4 })).join('')}</div>`;
    $('#gbpPosts').innerHTML = `<h2>Standard updates</h2>
      <p class="muted small">Post one of these as an <b>Update</b> every week or two. Google rejects updates that include a phone number in the text, so add it with the button instead. Add a photo to each post.</p>
      <div class="gbp-posts">${F.posts.map(([t, body, cta]) => `<article class="gbp-post"><h3>${A.esc(gbpFill(t, loc))}</h3>
        ${gbpField('Update text', gbpFill(body, loc), { limit: 1500, rows: 8 })}
        <p class="gbp-cta">Button: <b>${A.esc(cta === 'Call' ? 'Call now' : cta)}</b>${cta === 'Call' ? '' : ' → https://heartandleg.com'}</p></article>`).join('')}</div>`;
    const D = G.drafts || [];
    const lastOf = (n) => n.split(',')[0].trim().split(' ').slice(-1)[0].toLowerCase();
    const drafted = new Set(D.map((d) => lastOf(d.profileName)));
    const people = G.providers.filter((p) => !drafted.has(lastOf(p.name)));
    if (loc.providerName && !drafted.has(lastOf(loc.providerName)) && !people.some((p) => lastOf(p.name) === lastOf(loc.providerName))) {
      const [nm, ...cr] = loc.providerName.split(','); people.unshift({ name: nm.trim(), cred: cr.join(',').trim(), role: /\bMD|DO\b/.test(loc.providerName) ? 'md' : /PA/.test(loc.providerName) ? 'pa' : 'np' });
    }
    const draftCard = (d) => `<details class="gbp-person"><summary><h3>${A.esc(d.profileName)}</h3><span class="badge badge-ok">Draft from project hub</span></summary>
      ${d.confirm.length ? `<div class="gbp-confirm"><b>To confirm before publishing</b><ul>${d.confirm.map((c) => `<li>${A.esc(c)}</li>`).join('')}</ul></div>` : ''}
      <div class="gbp-grid">
      ${gbpField('Profile name', d.profileName, { note: 'Name and credential only. No practice name, “Dr.” or keywords, or Google may suspend the profile.' })}
      ${gbpField('Primary category', d.category)}
      ${d.additional.length ? gbpField('Additional categories', d.additional.join(', ')) : ''}
      ${gbpField('Address', d.address)}${gbpField('Phone', d.phone)}${gbpField('Hours', d.hours)}
      ${gbpField('Website', d.website)}${gbpField('Appointment link', d.appointment)}
      </div>
      ${gbpField('Description', d.description, { limit: 750, rows: 7 })}
      <h4>Services</h4><div class="gbp-grid">${d.services.map((sv) => gbpField(A.esc(sv.name), sv.description, { limit: 300, rows: 3, note: sv.description ? '' : 'No description in the draft yet. Add one or list the name only.' })).join('')}</div>
      ${d.post ? `<h4>First Google post</h4>${gbpField('Post title', d.post.title || '')}${gbpField('Post text', d.post.body || '', { limit: 1500, rows: 6 })}` : ''}
      </details>`;
    const templCard = (p) => {
      const R = G.roles[p.role], parts = p.name.split(' ');
      const full = p.name + (p.cred ? ', ' + p.cred : '');
      const text = gbpFill(R.text, loc, { NAME: p.name, CRED: p.cred, FIRST: parts[0], LAST: parts[parts.length - 1] });
      return `<details class="gbp-person"><summary><h3>${A.esc(full)}</h3><span class="badge badge-warn">No draft yet</span></summary>
        <p class="muted small">${A.esc(R.title)}. Starter wording only; replace it with a reviewed draft like the ones above.</p>
        ${gbpField('Profile name', full, { note: 'Name and credential only. No practice name, “Dr.” or keywords.' })}
        ${gbpField('Primary category', R.category)}
        ${gbpField('Description', text, { limit: 750, rows: 6 })}</details>`;
    };
    $('#gbpProviders').innerHTML = `<h2>Provider profiles</h2>
      <p class="muted small">Each provider who sees patients gets a separate profile with the practice address and phone. PAs and NPs list procedures only as evaluations, since physicians perform them. The clinical team approves all medical wording before anything is published.</p>
      <div class="gbp-people">${D.map(draftCard).join('')}${people.map(templCard).join('')}</div>`;
    $$('#tab-gbp .gbp-field').forEach(updateCount);
  }
  function updateCount(f) {
    const c = f.querySelector('.gbp-count'); if (!c) return;
    const n = f.querySelector('input,textarea').value.length, lim = +c.dataset.limit;
    c.textContent = `${n} / ${lim}`; c.classList.toggle('over', n > lim);
  }
  $('#tab-gbp').addEventListener('input', (e) => { const f = e.target.closest('.gbp-field'); if (f) updateCount(f); });
  $('#tab-gbp').addEventListener('click', async (e) => {
    const b = e.target.closest('.gbp-copy'); if (!b) return;
    const box = b.closest('.gbp-field').querySelector('input,textarea');
    try { await navigator.clipboard.writeText(box.value); } catch (x) { box.select(); document.execCommand('copy'); }
    b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1400);
  });
  $('#gbpLocation').addEventListener('change', renderGbp);

  /* ---------- orders ---------- */
  // what each orderable item is, shown under its preview on the order form
  const ORDER_DESC = {
    'trifold': 'Patient brochure on joint pain and vascular care, with this location’s address, hours and map.',
    'patient-folder': 'Pocket folder for new-patient paperwork and handouts.',
    'provider-folder': 'Pocket folder for referring-provider packets.',
    'flyer': 'Grand opening flyer with this location’s open house and community talk details.',
    'provider-flyer': 'Introduces this location’s featured provider and services. Two flyers per letter sheet.',
    'postcard': 'Direct-mail postcard announcing this location.',
    'art-18x24': 'Five watercolor joint prints (knee, hip, shoulder, hand, heel) for the waiting room.',
    'art-24x36': 'The same five watercolor joint prints at the larger 24 × 36 size.',
    'mousepad': 'Branded mousepad for front desks and referring offices.',
    'card': 'Personal business cards. Set the name, title, phone and photo on the Business cards tab first.',
    'newsletter-2026-11': 'Patient newsletter: new satellite locations, a joint-pain spotlight and more.',
    'provider-newsletter-2026-11': 'Newsletter for referring providers: locations, referral tips, GAE and TAME.',
    'vasc-guide': 'Patient guide to artery and vein conditions and how they are treated.',
    'joint-guide': 'Patient guide to joint and tendon pain and the treatment options.',
    'joint-guide-es': 'Spanish edition of the joint and tendon pain patient guide.',
    'vasc-guide-es': 'Spanish edition of the arteries and veins patient guide.',
    'provider-sheets': 'Six one-page clinical summaries for referring providers, one per service line.',
    'refer-card': 'Pocket card for providers: when to refer, red flags and how to refer.',
    'provider-guide': 'Booklet for referring providers covering our services and the referral process.',
    'flip-joint': 'Exam-room tent flip chart: pictures face the patient, talking points face the provider.',
    'flip-vasc': 'Exam-room tent flip chart for artery and vein conditions.',
    'pi-referral-form': 'Two-sided referral form for personal injury law firms.',
    'poster-hvlc-joint-pain': 'Joint pain wall poster, supplied as a print-ready PDF.',
    'slick-personal-injury': 'One-page referral sheet for personal injury attorneys and case managers.',
    'slick-workers-comp': 'One-page referral sheet for workers’ compensation adjusters and employers.',
    'slick-corrections': 'One-page referral sheet for correctional health teams.',
    'referral-form': 'Two-sided physician order form for referrals.'
  };
  const pieceFor = (key) => T.find((p) => p.id === (key === 'card' ? 'card-' + facility : key));
  // turn the plain quantity list into cards with a preview, a description and the quantity box
  function buildOrderCatalog() {
    const grid = $('#qtyGrid'); if (grid.dataset.built) return;
    const groups = {};
    $$('#qtyGrid label[data-piece]').forEach((l) => {
      const key = l.dataset.piece, input = l.querySelector('input'), p = pieceFor(key) || {};
      const raw = l.textContent.trim(), m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const title = m ? m[1] : raw, unit = m ? m[2] : '';
      l.className = 'qty-item'; l.textContent = '';
      l.innerHTML = `<div class="qty-thumb"></div><div class="qty-body"><span class="qty-title">${A.esc(title)}</span>` +
        `<span class="qty-desc">${A.esc(ORDER_DESC[key] || '')}</span><span class="qty-meta">${A.esc(p.size || '')}</span>` +
        `<span class="qty-field"><span>Quantity${unit ? ' <small>(' + A.esc(unit) + ')</small>' : ''}</span></span></div>`;
      l.querySelector('.qty-field').appendChild(input);
      const g = key === 'card' ? 'Business cards' : (p.group || 'Other');
      (groups[g] = groups[g] || []).push(l);
    });
    grid.textContent = '';
    Object.keys(groups).sort((a, b) => gIdx(a) - gIdx(b)).forEach((g) => {
      const sec = document.createElement('section'); sec.className = 'qty-group';
      sec.innerHTML = `<h3>${A.esc(g)}</h3><div class="qty-list"></div>`;
      groups[g].forEach((l) => sec.querySelector('.qty-list').appendChild(l));
      grid.appendChild(sec);
    });
    grid.dataset.built = '1';
  }
  // previews use the location picked on the order form (business cards use the card details)
  function renderOrderThumbs() {
    buildOrderCatalog();
    const loc = locations.find((l) => l.id === $('#orderLocation').value) || active() || {};
    $$('#qtyGrid .qty-item').forEach((l) => {
      const box = l.querySelector('.qty-thumb');
      if (l.hidden) { box.innerHTML = ''; return; }
      const p = pieceFor(l.dataset.piece);
      if (!p) { box.innerHTML = ''; return; }
      if (p.kind === 'file') { box.innerHTML = `<img src="${p.preview}" alt="" loading="lazy">`; return; }
      const pg = p.pages[0], isCard = p.kind === 'card';
      const html = isCard ? A.fill(pg.html, card.office, A.cardValues(card)) : A.fill(pg.html, loc);
      box.innerHTML = `<div class="qty-frame" data-w="${pg.w}" data-h="${pg.h}"><div class="sheet" style="width:${pg.w}px;height:${pg.h}px">${html}</div></div>`;
    });
    layoutThumbs();
  }
  function layoutThumbs() {
    $$('#qtyGrid .qty-frame').forEach((f) => {
      const box = f.parentElement, bw = box.clientWidth, bh = box.clientHeight; if (!bw) return;
      const w = +f.dataset.w, h = +f.dataset.h, sc = Math.min(bw / w, bh / h);
      f.style.width = Math.round(w * sc) + 'px'; f.style.height = Math.round(h * sc) + 'px';
      f.firstElementChild.style.transform = `scale(${sc})`;
    });
  }
  new ResizeObserver(() => layoutThumbs()).observe($('#qtyGrid'));
  $('#orderLocation').addEventListener('change', renderOrderThumbs);
  // show each group heading only when it has items for this facility
  function syncOrderGroups() {
    $$('#qtyGrid .qty-group').forEach((g) => { g.hidden = !$$('.qty-item', g).some((l) => !l.hidden); });
  }

  function fillOrderLocations() {
    const sel = $('#orderLocation');
    sel.innerHTML = locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('');
    sel.value = activeId;
    renderOrderThumbs(); syncOrderGroups();
  }

  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('#orderError');
    const qty = $$('#qtyGrid input').reduce((s, i) => s + (+i.value || 0), 0);
    if (!qty) { err.textContent = 'Add a quantity for at least one item.'; err.hidden = false; return; }
    const loc = locations.find((l) => l.id === f.elements.location.value) || {};
    const v = A.values(loc);
    $('#orderLocationDetails').value = [
      `Location: ${v.LOCATION_NAME}`, `Address: ${v.FULL_ADDRESS}`, `Hours: ${v.HOURS}`,
      `Open house: ${v.OPEN_HOUSE_DATE} ${v.OPEN_HOUSE_TIME}`.trim(), `Community talk: ${v.TALK_DATE} at ${v.TALK_VENUE}`
    ].join('\n');
    const cq = f.elements.qty_business_cards;
    $('#orderCardDetails').value = cq && +cq.value ? cardDetails() : '';
    const data = new FormData(f);
    data.set('location', v.LOCATION_NAME || 'Untitled');
    const withPhoto = !!(cq && +cq.value && card.photo);
    if (withPhoto) data.set('card_photo', await (await fetch(card.photo)).blob(), (card.name || 'card').replace(/[^A-Za-z0-9]+/g, '-') + '-photo.jpg');
    else data.delete('card_photo');
    try {
      const res = withPhoto
        ? await fetch('/', { method: 'POST', body: data })
        : await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
      if (!res.ok) throw new Error(String(res.status));
      err.hidden = true; f.hidden = true; $('#orderDone').hidden = false; f.reset();
    } catch (x) {
      const code = /^\d+$/.test(x.message) ? x.message : '';
      err.textContent = code === '404'
        ? 'The order could not be sent (error 404): Netlify is not accepting this form yet. In Netlify, turn on Forms → Form detection, then redeploy the site.'
        : `The order could not be sent${code ? ' (error ' + code + ')' : ''}. Check your connection and try again. Orders only work on the live Netlify site.`;
      err.hidden = false;
    }
  });
  $('#orderAgain').addEventListener('click', () => { $('#orderForm').hidden = false; $('#orderDone').hidden = true; fillOrderLocations(); });

  /* ---------- start ---------- */
  async function start() {
    const browserLocs = A.loadLocations();
    const list = await loadShared();
    if (list) {
      locations = list;
      const ids = new Set(list.map((l) => l.id));
      localOnly = browserLocs.filter((l) => !ids.has(l.id) && (l.street || l.city || l.hours || l.map));
    } else {
      locations = browserLocs.length ? browserLocs.map((l) => ({ ...blank(), ...l })) : [blank()];
    }
    if (!active()) activeId = locations[0] ? locations[0].id : '';
    A.setActiveId(activeId);
    if (shared && passcode) {
      try { await api('POST', null, '?check=1'); setEditable(true); }
      catch (e) { lock(); }
    } else setEditable(!shared);
    cacheLocally();
    refreshPicker(); loadForm(); renderAll();
    status(shared ? (locations.length ? 'Showing the shared location list.' : 'No shared locations yet. Unlock editing to add one.') : 'Saved in this browser only.');
    if (document.fonts) document.fonts.ready.then(layoutAll);
  }
  start();
})();
