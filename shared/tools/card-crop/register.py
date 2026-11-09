# register.py <thumb.png> <profile.png> — where the thumbnail sits in the profile picture: the square (x0, y0, size) of the profile
# that, scaled to the thumbnail's size, matches it best (sum of squared differences on both pictures laid on grey; FFT search)
import sys, numpy as np
from PIL import Image
tf, pf = sys.argv[1:3]
def flat(im):
    im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, (128, 128, 128, 255)); bg.alpha_composite(im); return np.asarray(bg.convert('RGB'), float) / 255
T0 = Image.open(tf); P0 = Image.open(pf); tw = T0.size[0]
def search(k, scales, pfix=None):
    P = flat(P0.resize((P0.size[0] // k, P0.size[1] // k), Image.LANCZOS)); H, W = P.shape[:2]; best = None
    for sc in scales:   # sc: thumbnail px per profile px
        c = tw / sc / k; n = int(round(c));
        if n >= min(H, W) or n < 8: continue
        T = flat(T0.resize((n, n), Image.LANCZOS))
        F = (H + n, W + n); ssd = np.zeros((H - n + 1, W - n + 1))
        for ch in range(3):
            p, t = P[..., ch], T[..., ch]
            corr = np.fft.irfft2(np.fft.rfft2(p, F) * np.conj(np.fft.rfft2(t, F)), F)[:H - n + 1, :W - n + 1]
            p2 = np.cumsum(np.cumsum(np.pad(p * p, ((1, 0), (1, 0))), 0), 1); win = p2[n:, n:] - p2[:-n, n:] - p2[n:, :-n] + p2[:-n, :-n]
            ssd += win[:H - n + 1, :W - n + 1] - 2 * corr + (t * t).sum()
        ssd /= n * n * 3; y, x = np.unravel_index(np.argmin(ssd), ssd.shape); v = ssd[y, x]
        if best is None or v < best[0]: best = (v, sc, x * k, y * k, n * k)
    return best
b = search(3, np.arange(0.6, 1.6, 0.01)); print('coarse: mse %.5f  scale %.2f  crop x0 %d y0 %d size %d' % b)
b2 = search(1, np.arange(b[1] - 0.02, b[1] + 0.021, 0.002)); print('fine:   mse %.5f  scale %.3f  crop x0 %d y0 %d size %d' % b2)
