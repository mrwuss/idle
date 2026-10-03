/* IFP brand: the official iFP logo (assets/brand, from ifpusa.com, used with IFP's
 * permission) and the brand colors. logoHTML() for the page; drawLogo() for the canvas. */
(function (root) {
  const BRAND = { orange: '#f04b25', charcoal: '#333333', gray: '#636363' };
  const LOGO = 'assets/brand/ifp-logo.png';          // 150 × 79, transparent
  const FAVICON = 'assets/brand/ifp-favicon.png';    // 270 × 270
  const RATIO = 150 / 79;

  /** The logo as an <img>. `white` turns it white (for orange or dark strips). */
  function logoHTML({ h = 32, white = false, alt = 'IFP' } = {}) {
    return `<img class="ifp-logo${white ? ' white' : ''}" src="${LOGO}" alt="${alt}" height="${h}" width="${Math.round(h * RATIO)}">`;
  }

  // Canvas copies: the original, and tinted versions made once the image loads.
  let img = null, ready = false;
  const tints = {}, waiting = [];
  if (typeof Image !== 'undefined') {
    img = new Image();
    img.onload = () => { ready = true; waiting.splice(0).forEach((f) => f()); };
    img.src = LOGO;
  }
  /** Run `fn` once the logo can be drawn (immediately if it already can). */
  function onReady(fn) { if (ready) fn(); else waiting.push(fn); }
  function tinted(color) {
    if (!color) return img;
    if (!tints[color]) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      tints[color] = c;
    }
    return tints[color];
  }
  /** Draw the logo `h` tall with its left edge at x, centred on y. `color` tints it; `alpha` fades it. */
  function drawLogo(ctx, x, y, h, { color = null, alpha = 1 } = {}) {
    if (!ready) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(tinted(color), x, y - h / 2, h * RATIO, h);
    ctx.restore();
    return true;
  }

  root.PW = root.PW || {};
  root.PW.brand = { BRAND, LOGO, FAVICON, RATIO, logoHTML, drawLogo, onReady };
  if (typeof module !== 'undefined') module.exports = root.PW.brand;
})(typeof window !== 'undefined' ? window : globalThis);
