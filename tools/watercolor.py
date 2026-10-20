import cv2, numpy as np, sys
rng = np.random.default_rng(7)
def noise(h, w, scale, octaves=4):
    out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        s = max(2, int(scale / (2 ** o)))
        n = rng.random((h // s + 2, w // s + 2)).astype(np.float32)
        out += amp * cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)[:h, :w]; tot += amp; amp *= 0.5
    out /= tot; return (out - out.min()) / (out.max() - out.min() + 1e-6)

def watercolor(src, maxdim=1800):
    im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4:
        a = im[..., 3:4] / 255.0; im = (im[..., :3] * a + 255 * (1 - a)).astype(np.uint8)
    h, w = im.shape[:2]; f = maxdim / max(h, w); im = cv2.resize(im, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
    h, w = im.shape[:2]
    # 1. simplify into soft pigment regions
    s = cv2.pyrMeanShiftFiltering(im, 18, 40)
    s = cv2.edgePreservingFilter(s, flags=1, sigma_s=60, sigma_r=0.45)
    # 2. wet bleed: displace with low-frequency noise
    dx = (noise(h, w, 90) - .5) * 14; dy = (noise(h, w, 90) - .5) * 14
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    s = cv2.remap(s, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    sf = s.astype(np.float32) / 255
    # 3. lighten/transparent wash: push toward paper
    lab = cv2.cvtColor(s, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] = 255 - (255 - lab[..., 0]) * 0.78
    lab[..., 1:] = 128 + (lab[..., 1:] - 128) * 1.08
    sf = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255
    # 4. edge darkening (pigment pooling at region borders)
    g = cv2.cvtColor((sf * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    gb = cv2.GaussianBlur(g, (0, 0), 2.2)
    edge = np.hypot(cv2.Sobel(gb, cv2.CV_32F, 1, 0), cv2.Sobel(gb, cv2.CV_32F, 0, 1))
    edge = np.clip(edge / (np.percentile(edge, 99) + 1e-6), 0, 1)
    edge = cv2.GaussianBlur(edge, (0, 0), 1.2)[..., None]
    paperish = (sf.mean(2, keepdims=True) > 0.93).astype(np.float32)
    sf = sf * (1 - 0.28 * edge * (1 - paperish))
    # 5. pigment granulation + flow mottling
    gran = noise(h, w, 6, 3)[..., None]; flow = noise(h, w, 160, 5)[..., None]
    dens = 1 - sf
    dens = dens * (0.82 + 0.3 * flow) * (0.9 + 0.2 * gran)
    sf = 1 - np.clip(dens, 0, 1)
    # 6. faint pencil line from original
    og = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    dog = cv2.GaussianBlur(og, (0, 0), 1.0) - cv2.GaussianBlur(og, (0, 0), 2.6)
    line = np.clip(-dog / 18, 0, 1)[..., None] * 0.28
    sf = sf * (1 - line * np.array([0.75, 0.72, 0.7]))
    # 7. paper texture
    paper = noise(h, w, 3, 2)[..., None]
    pap_col = np.array([0.93, 0.96, 0.975], np.float32)  # warm off-white (BGR)
    sf = sf * pap_col * (0.965 + 0.05 * paper)
    # 8. irregular soft vignette into paper (wash edge)
    yy, xx = (gy / h - .5) * 2, (gx / w - .5) * 2
    r = np.sqrt((xx / 0.98) ** 2 + (yy / 0.98) ** 2) + (noise(h, w, 60) - .5) * 0.25
    m = np.clip((1.0 - r) / 0.18, 0, 1)[..., None]
    sf = sf * m + pap_col * (0.965 + 0.05 * paper) * (1 - m)
    return np.clip(sf * 255, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    out = watercolor(sys.argv[1], int(sys.argv[3]) if len(sys.argv) > 3 else 1800)
    cv2.imwrite(sys.argv[2], out)
