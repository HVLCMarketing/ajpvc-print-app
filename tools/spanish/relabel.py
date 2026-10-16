import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
TT = '/tmp/claude-0/-home-claude/909ac31c-5ad3-5f08-91ae-a23efad988a1/scratchpad/es/ttf/'
FONTS = {'h': 'mont800.ttf', 'm': 'mont700.ttf', 'b': 'ps600.ttf', 'r': 'ps500.ttf'}
NAVY=(17,28,84); RED=(204,22,30); BLUE=(18,78,190); PURP=(92,24,132); GRAY=(78,82,88); LBLUE=(22,70,170); MUTE=(150,150,150)
def erase(im, box):
    a = np.asarray(im).astype(int); x0,y0,x1,y1 = box; r=4
    ring = np.concatenate([a[max(y0-r,0):y0, x0:x1].reshape(-1,3), a[y1:y1+r, x0:x1].reshape(-1,3),
                           a[y0:y1, max(x0-r,0):x0].reshape(-1,3), a[y0:y1, x1:x1+r].reshape(-1,3)])
    c = tuple(int(v) for v in np.median(ring, axis=0))
    ImageDraw.Draw(im).rectangle(box, fill=c)
def text(im, lines, font, size, color, x, y, align='left', maxw=None, lh=1.18):
    d = ImageDraw.Draw(im)
    while True:
        f = ImageFont.truetype(TT + FONTS[font], size)
        w = max(d.textlength(l, font=f) for l in lines)
        if not maxw or w <= maxw or size <= 8: break
        size -= 1
    for i, l in enumerate(lines):
        lw = d.textlength(l, font=f)
        xx = x if align == 'left' else (x - lw / 2 if align == 'center' else x - lw)
        d.text((xx, y + i * size * lh), l, font=f, fill=color)
SPEC = {
 'circ': ('circulation2.jpg', [
   ((797,46,892,92), ['Corazón'], 'b', 29, NAVY, 800, 52, 'left', 160),
   ((6,300,299,363), ['ARTERIAS'], 'h', 50, RED, 16, 306, 'left', 280),
   ((6,364,333,444), ['Llevan sangre del', 'corazón a las piernas.'], 'b', 29, NAVY, 16, 368, 'left', 335),
   ((874,300,1062,363), ['VENAS'], 'h', 50, BLUE, 878, 306, 'left', 300),
   ((874,364,1209,444), ['Llevan la sangre de las', 'piernas al corazón.'], 'b', 29, NAVY, 878, 368, 'left', 328),
   ((874,864,1152,916), ['CAPILARES'], 'h', 42, NAVY, 880, 870, 'left', 300),
   ((874,917,1172,987), ['Vasos diminutos que', 'unen arterias y venas.'], 'b', 29, NAVY, 882, 920, 'left', 322),
   ((498,1010,708,1044), ['Ilustración simplificada'], 'r', 18, MUTE, 603, 1016, 'center', 220)]),
 'angio': ('angio.jpg', [
   ((68,24,452,90), ['ANGIOGRAMA'], 'h', 50, NAVY, 262, 30, 'center', 460),
   ((563,24,967,90), ['ANGIOPLASTIA'], 'h', 50, NAVY, 765, 30, 'center', 460),
   ((1118,24,1417,90), ['STENT'], 'h', 50, NAVY, 1268, 30, 'center', 460),
   ((1173,88,1362,130), ['Si es necesario'], 'b', 32, NAVY, 1268, 92, 'center', 400),
   ((52,298,234,338), ['Medio de contraste'], 'b', 23, NAVY, 50, 304, 'left', 235),
   ((313,294,447,333), ['Estrechamiento'], 'b', 23, NAVY, 382, 300, 'center', 185),
   ((778,258,882,296), ['Balón'], 'b', 27, NAVY, 830, 263, 'center', 200),
   ((22,612,502,708), ['El medio de contraste y los rayos X', 'ayudan a ubicar arterias estrechas.'], 'b', 31, NAVY, 262, 622, 'center', 460),
   ((556,602,968,742), ['Un pequeño balón ensancha', 'la arteria estrecha.'], 'b', 33, NAVY, 762, 610, 'center', 430),
   ((556,690,968,742), ['Luego se retira el balón.'], 'b', 28, NAVY, 762, 700, 'center', 430),
   ((1028,602,1492,738), ['Un pequeño tubo de malla', 'puede quedarse para ayudar', 'a mantener abierta la arteria.'], 'b', 31, NAVY, 1262, 610, 'center', 455),
   ((672,788,843,817), ['Ilustración simplificada'], 'r', 17, MUTE, 758, 792, 'center', 220)]),
 'close': ('vein-closure.jpg', [
   ((148,26,602,74), ['ANTES DEL TRATAMIENTO'], 'h', 40, NAVY, 376, 31, 'center', 560),
   ((913,26,1347,74), ['DESPUÉS DEL TRATAMIENTO'], 'h', 40, NAVY, 1134, 31, 'center', 600),
   ((68,260,251,300), ['Vena dañada'], 'b', 27, PURP, 248, 265, 'right', 240),
   ((514,264,690,304), ['Vena sana'], 'b', 27, LBLUE, 518, 269, 'left', 200),
   ((838,278,1003,317), ['Vena cerrada'], 'b', 27, GRAY, 1000, 283, 'right', 220),
   ((1271,264,1447,304), ['Vena sana'], 'b', 27, LBLUE, 1276, 269, 'left', 200),
   ((1241,106,1414,140), ['Hacia el corazón'], 'b', 22, LBLUE, 1248, 111, 'left', 245),
   ((178,698,577,797), ['Una vena dañada deja', 'que la sangre se acumule.'], 'm', 34, NAVY, 376, 708, 'center', 560),
   ((823,698,1457,797), ['La vena dañada se cierra.', 'La sangre regresa por venas sanas.'], 'm', 34, NAVY, 1140, 708, 'center', 620),
   ((418,826,1092,874), ['Con el tiempo, la vena tratada se encoge.'], 'm', 36, NAVY, 755, 832, 'center', 1000),
   ((658,876,850,904), ['Ilustración simplificada'], 'r', 17, MUTE, 754, 880, 'center', 220)]),
}
src_dir = sys.argv[1]
for key, (fn, items) in SPEC.items():
    im = Image.open(src_dir + '/' + fn).convert('RGB')
    for it in items: erase(im, it[0])
    for it in items: text(im, *it[1:])
    im.save(f'{key}-es.jpg', quality=92); print(key)
