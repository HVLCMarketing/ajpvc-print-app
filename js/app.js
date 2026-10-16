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
  const blank = () => ({ id: uid(), locationName: 'New location', street: '', city: '', state: 'CA', zip: '', hours: '', map: '', openHouseDate: '', openHouseTime: '', talkDate: '', talkVenue: '' });
  const active = () => locations.find((l) => l.id === activeId);
  const status = (msg, warn) => { const s = $('#saveState'); s.textContent = msg; s.classList.toggle('warn', !!warn); };

  /* ---------- tabs ---------- */
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('.tab-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + b.dataset.tab; });
    if (b.dataset.tab === 'order') fillOrderLocations();
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
    ['locationName', 'street', 'city', 'state', 'zip', 'hours', 'openHouseDate', 'openHouseTime', 'talkDate', 'talkVenue']
      .forEach((k) => { f.elements[k].value = loc[k] || ''; });
    showMap();
  }

  function showMap() {
    const loc = active() || {};
    $('#mapPreview').innerHTML = loc.map ? `<img src="${loc.map}" alt="Uploaded location map">` : '<span>No map yet</span>';
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

  // map upload: downscale so the shared list stays quick to load
  $('#mapFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file || !active() || !canEdit) return;
    const img = new Image();
    img.onload = () => {
      const max = 1400, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      active().map = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      queueSave(active()); showMap(); renderAll();
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  });
  $('#clearMap').addEventListener('click', () => { if (!active() || !canEdit) return; active().map = ''; queueSave(active()); showMap(); renderAll(); });

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
    const mine = T.filter((p) => forFac(p) && p.kind !== 'card').sort(byGroup);
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
    const shown = T.filter((p) => p.kind !== 'card' && (p.facility === facility || p.facility === 'both') && (pieceFilter === 'all' || p.id === pieceFilter || 'group:' + p.group === pieceFilter)).sort(byGroup);
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
    saveCard();
    const p = cardPiece(); if (!p) return;
    $('#cardTitle').textContent = p.title;
    $('#cardPrint').href = 'print.html?piece=' + p.id;
    const extra = A.cardValues(card);
    $('#cardPreview').innerHTML = '<div class="card-pages">' + p.pages.map((pg) =>
      `<figure class="page"><div class="page-frame" data-w="${pg.w}" data-h="${pg.h}"><div class="sheet" style="width:${pg.w}px;height:${pg.h}px">${A.fill(pg.html, card.office, extra)}</div></div><figcaption>${A.esc(pg.label)}</figcaption></figure>`).join('') + '</div>';
    layoutAll();
  }
  $('#cardForm').addEventListener('input', (e) => {
    const k = e.target.name; if (!k) return;
    if (k === 'office') card.officeId = e.target.value; else card[k] = e.target.value;
    renderCard();
  });
  $('#cardOrder').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="order"]').click();
    const q = document.querySelector('#qtyGrid input[name="qty_business_cards"]');
    if (q) { if (!+q.value) q.value = 1; q.focus(); }
  });
  function cardDetails() {
    const o = card.office || {};
    return [`Card style: ${cardPiece() ? cardPiece().title : ''}`, `Name: ${card.name || ''}`, `Title: ${card.title || ''}`, `Direct: ${card.direct || ''}`,
      `Cell: ${card.cell || ''}`, `Email: ${card.email || ''}`, `Office: ${[o.street, [o.city, o.state].filter(Boolean).join(', '), o.zip].filter(Boolean).join(' ')}`].join('\n');
  }

  /* ---------- orders ---------- */
  function fillOrderLocations() {
    const sel = $('#orderLocation');
    sel.innerHTML = locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('');
    sel.value = activeId;
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
    try {
      const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
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
