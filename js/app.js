(function () {
  const A = window.AJPVC;
  const T = window.AJPVC_TEMPLATES;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let locations = A.loadLocations();
  let activeId = A.getActiveId();

  const uid = () => 'loc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = () => ({ id: uid(), locationName: 'New location', street: '', city: '', state: 'CA', zip: '', hours: '', map: '', openHouseDate: '', openHouseTime: '', talkDate: '', talkVenue: '' });
  const active = () => locations.find((l) => l.id === activeId);

  /* ---------- tabs ---------- */
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('.tab-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + b.dataset.tab; });
    if (b.dataset.tab === 'order') fillOrderLocations();
    else layoutAll();
  }));

  /* ---------- locations ---------- */
  function persist() {
    const ok = A.saveLocations(locations);
    $('#saveState').textContent = ok ? 'Saved in this browser.' : 'Could not save — the map image may be too large. Try a smaller image.';
    $('#saveState').classList.toggle('warn', !ok);
  }

  function refreshPicker() {
    const sel = $('#locSelect');
    sel.innerHTML = locations.map((l) => `<option value="${l.id}">${A.esc(l.locationName || 'Untitled')}</option>`).join('');
    sel.value = activeId;
  }

  function loadForm() {
    const loc = active();
    const f = $('#locForm');
    ['locationName', 'street', 'city', 'state', 'zip', 'hours', 'openHouseDate', 'openHouseTime', 'talkDate', 'talkVenue']
      .forEach((k) => { f.elements[k].value = loc[k] || ''; });
    showMap();
  }

  function showMap() {
    const loc = active();
    $('#mapPreview').innerHTML = loc.map ? `<img src="${loc.map}" alt="Uploaded location map">` : '<span>No map yet</span>';
  }

  $('#locForm').addEventListener('input', (e) => {
    const loc = active();
    if (!loc || !e.target.name || !(e.target.name in loc)) return;
    loc[e.target.name] = e.target.value;
    persist();
    if (e.target.name === 'locationName') refreshPicker();
    renderAll();
  });

  $('#locSelect').addEventListener('change', (e) => {
    activeId = e.target.value; A.setActiveId(activeId); loadForm(); renderAll();
  });

  $('#newLoc').addEventListener('click', () => {
    const loc = blank(); locations.push(loc); activeId = loc.id; A.setActiveId(activeId);
    persist(); refreshPicker(); loadForm(); renderAll();
    $('#locForm').elements.locationName.select();
  });

  $('#deleteLoc').addEventListener('click', () => {
    const loc = active();
    if (!loc || !confirm(`Delete "${loc.locationName}" from this browser?`)) return;
    locations = locations.filter((l) => l.id !== loc.id);
    if (!locations.length) locations.push(blank());
    activeId = locations[0].id; A.setActiveId(activeId);
    persist(); refreshPicker(); loadForm(); renderAll();
  });

  // map upload: downscale so it fits comfortably in browser storage
  $('#mapFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const img = new Image();
    img.onload = () => {
      const max = 1400, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      active().map = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      persist(); showMap(); renderAll();
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  });
  $('#clearMap').addEventListener('click', () => { active().map = ''; persist(); showMap(); renderAll(); });

  $('#exportLocs').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(locations, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ajpvc-locations.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importLocs').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('not a list');
      data.forEach((d) => {
        if (!d || typeof d !== 'object') return;
        d.id = d.id || uid();
        const i = locations.findIndex((l) => l.id === d.id);
        if (i >= 0) locations[i] = { ...blank(), ...d }; else locations.push({ ...blank(), ...d });
      });
      persist(); refreshPicker(); loadForm(); renderAll();
    } catch (err) { alert('That file is not a locations export.'); }
    e.target.value = '';
  });

  /* ---------- gallery ---------- */
  function renderAll() {
    const loc = active();
    const host = $('#pieces');
    host.innerHTML = T.map((p) => {
      const pages = p.pages.map((pg) => ({ ...pg, filled: A.fill(pg.html, loc) }));
      const n = pages.reduce((s, pg) => s + A.countPlaceholders(pg.filled), 0);
      return `<article class="piece" data-id="${p.id}">
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
    const data = new FormData(f);
    data.set('location', v.LOCATION_NAME || 'Untitled');
    try {
      const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
      if (!res.ok) throw new Error(res.status);
      err.hidden = true; f.hidden = true; $('#orderDone').hidden = false; f.reset();
    } catch (x) {
      err.textContent = 'The order could not be sent. Check your connection and try again. (Orders only work on the deployed Netlify site.)';
      err.hidden = false;
    }
  });
  $('#orderAgain').addEventListener('click', () => { $('#orderForm').hidden = false; $('#orderDone').hidden = true; fillOrderLocations(); });

  /* ---------- start ---------- */
  async function start() {
    if (!locations.length) {
      try { const r = await fetch('locations.json', { cache: 'no-store' }); if (r.ok) locations = await r.json(); } catch (e) {}
      if (!Array.isArray(locations) || !locations.length) locations = [blank()];
      locations = locations.map((l) => ({ ...blank(), ...l }));
      persist();
    }
    if (!active()) activeId = locations[0].id;
    A.setActiveId(activeId);
    refreshPicker(); loadForm(); renderAll();
    if (document.fonts) document.fonts.ready.then(layoutAll);
  }
  start();
})();
