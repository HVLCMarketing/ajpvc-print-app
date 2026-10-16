import re, glob, json, os, sys
P = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(P, '..', 'canvas', 'project')
INL = r'<(?:/?(?:b|i|strong|em|sup|sub|u)(?:\s[^>]*)?|br\s*/?)>'
UNIT = re.compile(r'(?<=>)((?:[^<>]|' + INL + r')+)(?=<)')
ATTR = re.compile(r'(alt|aria-label)="([^"]*[A-Za-z][^"]*)"')
def body(src):
    a = src.index('<x-dc>'); b = src.index('</x-dc>')
    return a, b
def units(src):
    a, b = body(src); seg = src[a:b]
    seg = re.sub(r'<helmet>.*?</helmet>', lambda m: ' ' * len(m.group(0)), seg, flags=re.S)
    seg = re.sub(r'<style[^>]*>.*?</style>', lambda m: ' ' * len(m.group(0)), seg, flags=re.S)
    out = []
    for m in UNIT.finditer(seg):
        t = m.group(1)
        if re.search(r'[A-Za-z]', re.sub(INL, '', t)) and not re.fullmatch(r'\s*\{\{[A-Z_0-9]+\}\}\s*', t): out.append(t.strip())
    for m in ATTR.finditer(seg): out.append(m.group(2))
    # titles in <title>
    return out
if __name__ == '__main__':
    allu = []
    for f in sorted(glob.glob(C + '/JointGuide*.dc.html')) + sorted(glob.glob(C + '/VascGuide*.dc.html')):
        if 'ES' in os.path.basename(f): continue
        for u in units(open(f, encoding='utf-8').read()):
            if u not in allu: allu.append(u)
    json.dump(allu, open(os.path.join(P, 'strings.json'), 'w'), ensure_ascii=False, indent=0)
    print(len(allu), sum(len(u) for u in allu))
