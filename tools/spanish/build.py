import re, json, glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import UNIT, ATTR, INL, C
T = {}
for i in range(1, 5): T.update(json.load(open(f'tr_{i}.json', encoding='utf-8')))
T.update(json.load(open('review_fixes.json', encoding='utf-8')))
over = json.load(open('overrides.json', encoding='utf-8')) if os.path.exists('overrides.json') else {}
T.update(over)
FIT = json.load(open('fit.json'))
SWAP = {'f28a348d1ac4f9d33391b50a48f4fa0e': '280319eaa8e4fbabcee63c8a0369bbf7', '84fa373e8e530fcfccf6dcf61035b46b': 'a8ad252279d92c52adf45bc2eb87542d', 'db6e4aa2143060ca68f2305e0fdfdd93': '063ee20945171f01440fc9cf978b4053'}
KEEP = ('Advanced Joint Pain &amp; Vascular Center', 'Heart Vascular &amp; Leg Center')
def fix(v):
    tmp = v
    for i, k in enumerate(KEEP): tmp = tmp.replace(k, f'@@{i}@@')
    tmp = tmp.replace(' &amp; ', ' y ')
    for i, k in enumerate(KEEP): tmp = tmp.replace(f'@@{i}@@', k)
    return tmp
T = {k: fix(v) for k, v in T.items()}
miss = set()
def tr(t):
    s = t.strip()
    if not re.search(r'[A-Za-z]', re.sub(INL, '', s)) or re.fullmatch(r'\s*\{\{[A-Z_0-9]+\}\}\s*', s): return t
    if s not in T: miss.add(s); return t
    lead = t[:len(t) - len(t.lstrip())]; trail = t[len(t.rstrip()):]
    return lead + T[s] + trail
OUT = sys.argv[1] if len(sys.argv) > 1 else C
n = 0
for f in sorted(glob.glob(C + '/JointGuide[0-9]*.dc.html')) + sorted(glob.glob(C + '/VascGuide[0-9]*.dc.html')):
    src = open(f, encoding='utf-8').read()
    a = src.index('<x-dc>'); b = src.index('</x-dc>')
    seg = src[a:b]
    parts = re.split(r'(<helmet>.*?</helmet>|<style[^>]*>.*?</style>)', seg, flags=re.S)
    for i in range(0, len(parts), 2):
        parts[i] = UNIT.sub(lambda m: tr(m.group(1)), parts[i])
        parts[i] = ATTR.sub(lambda m: f'{m.group(1)}="{T.get(m.group(2), m.group(2))}"', parts[i])
    new = src[:a] + ''.join(parts) + src[b:]
    for a_, b_ in SWAP.items(): new = new.replace('/_blob/' + a_, '/_blob/' + b_)
    new = new.replace('<html lang="en">', '<html lang="es">')
    new = re.sub(r'<title>(.*?)</title>', lambda m: '<title>' + m.group(1).replace('Joint and tendon pain guide', 'Guía de dolor articular, español').replace('Arterial and venous guide', 'Guía arterial y venosa, español').replace('page', 'página') + '</title>', new)
    base = os.path.basename(f).replace('Guide', 'GuideES')
    fac = FIT.get(base.split('.')[0])
    if fac:
        i = new.index('<main'); j = new.index('</main>')
        mid = re.sub(r'font-size: ([\d.]+)px', lambda m: f'font-size: {round(float(m.group(1))*fac, 2)}px', new[i:j])
        mid = re.sub(r'gap: ([\d. px]+?)(;|")', lambda m: 'gap: ' + re.sub(r'([\d.]+)px', lambda n: f'{round(float(n.group(1))*fac, 2)}px', m.group(1)) + m.group(2), mid)
        new = new[:i] + mid + new[j:]
    open(os.path.join(OUT, base), 'w', encoding='utf-8').write(new); n += 1
print('wrote', n, 'missing', len(miss)); [print('  MISS', m[:90]) for m in sorted(miss)]
