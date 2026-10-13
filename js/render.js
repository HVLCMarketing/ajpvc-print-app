// Shared by the app and the print page: location storage and template filling.
(function () {
  const KEY = 'ajpvc.locations.v1';
  const ACTIVE = 'ajpvc.activeLocation.v1';

  const LABELS = {
    LOCATION_NAME: '[LOCATION NAME]', STREET: '[STREET ADDRESS]', CITY: '[CITY]',
    CITY_STATE_ZIP: '[CITY, STATE ZIP]', FULL_ADDRESS: '[ADDRESS]', HOURS: '[HOURS]',
    OPEN_HOUSE_DATE: '[OPEN HOUSE DATE]', OPEN_HOUSE_TIME: '[TIME]',
    TALK_DATE: '[TALK DATE]', TALK_VENUE: '[VENUE]', MAP: '[LOCATION MAP]'
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s) => (s || '').trim();

  function values(loc) {
    loc = loc || {};
    const city = clean(loc.city), st = clean(loc.state).toUpperCase(), zip = clean(loc.zip), street = clean(loc.street);
    const csz = city ? `${city}${st ? ', ' + st : ''}${zip ? ' ' + zip : ''}` : '';
    return {
      LOCATION_NAME: clean(loc.locationName),
      STREET: street,
      CITY: city,
      CITY_STATE_ZIP: csz,
      FULL_ADDRESS: [street, csz].filter(Boolean).join(', '),
      HOURS: clean(loc.hours),
      OPEN_HOUSE_DATE: clean(loc.openHouseDate),
      OPEN_HOUSE_TIME: clean(loc.openHouseTime),
      TALK_DATE: clean(loc.talkDate),
      TALK_VENUE: clean(loc.talkVenue)
    };
  }

  const PH = /\[[A-Z0-9][A-Za-z0-9 ,:&;/\-]*\]/g;

  function fill(html, loc) {
    const v = values(loc);
    let out = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
      if (k === 'MAP') {
        return loc && loc.map
          ? `<img src="${loc.map}" alt="Map showing the clinic location" class="map-img">`
          : `<mark class="ph">${LABELS.MAP}</mark>`;
      }
      return v[k] ? esc(v[k]) : `<mark class="ph">${LABELS[k] || '[' + k + ']'}</mark>`;
    });
    if (loc && loc.map) out = out.replace('class="map-slot"', 'class="map-slot has-map"');
    // highlight placeholders that are fixed in the design itself
    out = out.replace(/>([^<]*)</g, (m, t) => '>' + t.replace(PH, (s) => `<mark class="ph">${s}</mark>`) + '<');
    return out;
  }

  function countPlaceholders(html) {
    return (html.match(/<mark class="ph">/g) || []).length;
  }

  function loadLocations() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function saveLocations(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function getActiveId() { try { return localStorage.getItem(ACTIVE); } catch (e) { return null; } }
  function setActiveId(id) { try { localStorage.setItem(ACTIVE, id); } catch (e) {} }

  window.AJPVC = { fill, values, countPlaceholders, loadLocations, saveLocations, getActiveId, setActiveId, esc };
})();
