(function () {
  const A = window.AJPVC;
  const id = new URLSearchParams(location.search).get('piece');
  const piece = window.AJPVC_TEMPLATES.find((p) => p.id === id);
  const locs = A.loadLocations();
  const loc = locs.find((l) => l.id === A.getActiveId()) || locs[0] || {};

  if (!piece) { document.getElementById('printTitle').textContent = 'Unknown piece'; return; }

  const [wIn, hIn] = piece.inches;
  document.getElementById('pageSize').textContent = `@page { size: ${wIn}in ${hIn}in; margin: 0; }`;
  document.title = `${piece.title} · ${A.values(loc).LOCATION_NAME || 'AJPVC'}`;
  document.getElementById('printTitle').textContent = piece.title;
  document.getElementById('printMeta').textContent = ` · ${A.values(loc).LOCATION_NAME || 'No location'} · ${piece.size}`;

  let left = 0;
  document.getElementById('sheets').innerHTML = piece.pages.map((pg) => {
    const html = A.fill(pg.html, loc); left += A.countPlaceholders(html);
    // each sheet is drawn at 96 px per inch, so it prints at true size
    return `<div class="print-sheet" style="width:${wIn}in;height:${hIn}in"><div class="sheet" style="width:${pg.w}px;height:${pg.h}px;transform:scale(${(wIn * 96) / pg.w})">${html}</div></div>`;
  }).join('');

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
})();
