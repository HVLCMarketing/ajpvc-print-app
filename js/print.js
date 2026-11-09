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
  const opts = { flip: !!(piece.duplex && landscape), bleed: false, marks: false };
  const BLEED = 0.125;
  const optBox = document.getElementById('printOpts');
  optBox.innerHTML =
    (twoSided && landscape ? `<label class="opt"><input type="checkbox" id="optFlip" ${opts.flip ? 'checked' : ''}> Turn back side for two-sided printing</label>` : '') +
    `<label class="opt"><input type="checkbox" id="optBleed"> Add 1/8 in bleed (print shop)</label>` +
    `<label class="opt" title="Office printers cannot print to the paper edge. This prints the piece bigger than the paper size with trim marks, so you can cut it to a full-color edge."><input type="checkbox" id="optMarks"> Edge-to-edge on an office printer: bleed + trim marks on larger paper (11 × 17 for letter-size pieces)</label>`;
  let left = 0;
  function sheets() {
    left = 0;
    const b = (opts.bleed || opts.marks) ? BLEED : 0, W = wIn + 2 * b, Hh = hIn + 2 * b;
    // trim marks: put the piece in the middle of a larger sheet (tabloid when it fits, else 3/4 in extra each side)
    let PW = W, PH = Hh;
    if (opts.marks) {
      if (W <= 16 && Hh <= 10) { PW = 17; PH = 11; }
      else if (Hh <= 16 && W <= 10) { PW = 11; PH = 17; }
      else { PW = W + 1.5; PH = Hh + 1.5; }
    }
    const ox = (PW - W) / 2, oy = (PH - Hh) / 2;
    document.getElementById('pageSize').textContent = `@page { size: ${PW}in ${PH}in; margin: 0; }`;
    const L = ox + b, R = ox + W - b, T = oy + b, B = oy + Hh - b, off = b + 0.0625, len = 0.25;
    const ln = (x, y, w, h) => `<div style="position:absolute;left:${x}in;top:${y}in;width:${w}in;height:${h}in;background:#000"></div>`;
    const px = 1 / 96;
    const markHtml = opts.marks ? [L, R].map((x) => [T, B].map((y) => {
      const sx = x === L ? -1 : 1, sy = y === T ? -1 : 1;
      return ln(sx < 0 ? x - off - len : x + off, y - px / 2, len, px) + ln(x - px / 2, sy < 0 ? y - off - len : y + off, px, len);
    }).join('')).join('') : '';
    document.getElementById('sheets').innerHTML = piece.pages.map((pg, i) => {
      const html = A.fill(pg.html, loc, extra); left += A.countPlaceholders(html);
      // each sheet is drawn at 96 px per inch, so it prints at true size
      const sc = (wIn * 96) / pg.w;
      const turn = opts.flip && i % 2 === 1 ? 'transform: rotate(180deg);' : '';
      // bleed: a slightly enlarged copy behind the page carries the edge colors past the trim line
      const under = b ? `<div class="sheet" aria-hidden="true" style="width:${pg.w}px;height:${pg.h}px;transform:scale(${(W * 96) / pg.w}, ${(Hh * 96) / pg.h})">${html}</div>` : '';
      return `<div class="print-sheet" style="width:${PW}in;height:${PH}in"><div class="sheet-turn" style="position:absolute;inset:0;${turn}">${markHtml}` +
        `<div style="position:absolute;left:${ox}in;top:${oy}in;width:${W}in;height:${Hh}in;overflow:hidden">${under}` +
        `<div class="sheet" style="width:${pg.w}px;height:${pg.h}px;transform:translate(${b}in, ${b}in) scale(${sc})">${html}</div></div></div></div>`;
    }).join('');
  }
  sheets();
  optBox.addEventListener('change', (e) => {
    if (e.target.id === 'optFlip') opts.flip = e.target.checked;
    if (e.target.id === 'optBleed') opts.bleed = e.target.checked;
    if (e.target.id === 'optMarks') opts.marks = e.target.checked;
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
