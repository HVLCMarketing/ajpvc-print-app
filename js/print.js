(function () {
  const A = window.AJPVC;
  const id = new URLSearchParams(location.search).get('piece');
  const piece = window.AJPVC_TEMPLATES.find((p) => p.id === id);
  if (!piece) { document.getElementById('printTitle').textContent = 'Unknown piece'; return; }

  // read the shared location list, falling back to this browser's copy
  fetch('/api/locations', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => A.loadLocations())
    .then((locs) => draw((locs || []).find((l) => l.id === A.getActiveId()) || (locs || [])[0] || {}));

  let card = null;
  if (piece.kind === 'card') { try { card = JSON.parse(localStorage.getItem('ajpvc.card.v1')) || {}; } catch (e) { card = {}; } }

  function draw(loc) {
  if (card) loc = card.office || {};
  const extra = card ? A.cardValues(card) : null;

  const [wIn, hIn] = piece.inches;
  document.title = card ? `${piece.title} · ${card.name || 'No name'}` : `${piece.title} · ${A.values(loc).LOCATION_NAME || 'AJPVC'}`;
  document.getElementById('printTitle').textContent = piece.title;
  document.getElementById('printMeta').textContent = ` · ${card ? (card.name || 'No name') : (A.values(loc).LOCATION_NAME || 'No location')} · ${piece.size}`;

  // print options: back sides turned 180° for two-sided printers that flip on the long edge,
  // and a 1/8 in bleed on every side for print shops
  const landscape = wIn > hIn, twoSided = piece.pages.length === 2 || piece.duplex;
  const opts = { flip: !!(piece.duplex && landscape), bleed: false };
  const BLEED = 0.125;
  const optBox = document.getElementById('printOpts');
  optBox.innerHTML =
    (twoSided && landscape ? `<label class="opt"><input type="checkbox" id="optFlip" ${opts.flip ? 'checked' : ''}> Turn back side for two-sided printing</label>` : '') +
    `<label class="opt"><input type="checkbox" id="optBleed"> Add 1/8 in bleed (print shop)</label>`;
  let left = 0;
  function sheets() {
    left = 0;
    const b = opts.bleed ? BLEED : 0, W = wIn + 2 * b, Hh = hIn + 2 * b;
    document.getElementById('pageSize').textContent = `@page { size: ${W}in ${Hh}in; margin: 0; }`;
    document.getElementById('sheets').innerHTML = piece.pages.map((pg, i) => {
      const html = A.fill(pg.html, loc, extra); left += A.countPlaceholders(html);
      // each sheet is drawn at 96 px per inch, so it prints at true size
      const sc = (wIn * 96) / pg.w;
      const turn = opts.flip && i % 2 === 1 ? 'transform: rotate(180deg);' : '';
      // bleed: a slightly enlarged copy behind the page carries the edge colors past the trim line
      const under = b ? `<div class="sheet" aria-hidden="true" style="width:${pg.w}px;height:${pg.h}px;transform:scale(${(W * 96) / pg.w}, ${(Hh * 96) / pg.h})">${html}</div>` : '';
      return `<div class="print-sheet" style="width:${W}in;height:${Hh}in"><div class="sheet-turn" style="position:absolute;inset:0;${turn}">${under}` +
        `<div class="sheet" style="width:${pg.w}px;height:${pg.h}px;transform:translate(${b}in, ${b}in) scale(${sc})">${html}</div></div></div>`;
    }).join('');
  }
  sheets();
  optBox.addEventListener('change', (e) => {
    if (e.target.id === 'optFlip') opts.flip = e.target.checked;
    if (e.target.id === 'optBleed') opts.bleed = e.target.checked;
    sheets();
  });

  if (left) {
    const w = document.getElementById('printWarn');
    w.textContent = `${left} placeholder${left > 1 ? 's' : ''} still highlighted`; w.hidden = false;
  }

  const imgs = Array.from(document.images).map((im) => im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; }));
  Promise.all([document.fonts ? document.fonts.ready : null, ...imgs]).then(() => {
    const b = document.getElementById('printBtn');
    b.disabled = false;
    b.addEventListener('click', () => {
      if (left && !confirm('Some placeholders are still highlighted and will print. Print anyway?')) return;
      window.print();
    });
  });
  }
})();
