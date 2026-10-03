/* IFP brand: the italic "iFP" mark with its swoosh, colors from ifpusa.com.
 * logoSVG() for the page (header, ID badges, favicon); drawLogo() for the canvas. */
(function (root) {
  const BRAND = { orange: '#f04b25', charcoal: '#333333', gray: '#636363' };

  // The swoosh: a crescent that sweeps under the letters and up past the P.
  const SWOOSH = 'M6 64 C 36 79, 108 80, 148 38 C 116 70, 46 75, 6 64 Z';

  /** The mark as an inline SVG string. `h` is the rendered height in px. */
  function logoSVG({ color = BRAND.orange, h = 32, title = 'IFP' } = {}) {
    const w = Math.round(h * 150 / 80);
    return `<svg class="ifp-logo" width="${w}" height="${h}" viewBox="0 0 150 80" role="img" aria-label="${title}">
      <g fill="${color}"><text x="14" y="56" font-family="'Nunito Sans', 'Arial Black', Arial, sans-serif" font-weight="900"
        font-style="italic" font-size="62" letter-spacing="-3">iFP</text><path d="${SWOOSH}"/></g></svg>`;
  }

  /** Draw the mark on a canvas, left edge at x, baseline area centred on y, `h` tall. */
  function drawLogo(ctx, x, y, h, color = BRAND.orange, font = "'Nunito Sans', 'Arial Black', Arial, sans-serif") {
    const k = h / 80;
    ctx.save();
    ctx.translate(x, y - h / 2);
    ctx.scale(k, k);
    ctx.fillStyle = color;
    ctx.font = `italic 900 62px ${font}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('iFP', 14, 56);
    if (root.Path2D) ctx.fill(new Path2D(SWOOSH));
    ctx.restore();
  }

  /** Favicon: the mark on a white tile, as a data URL. */
  function faviconURL() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fff"/>
      <g transform="translate(2 12) scale(0.4)" fill="${BRAND.orange}"><text x="14" y="56" font-family="Arial Black, Arial, sans-serif"
      font-weight="900" font-style="italic" font-size="62" letter-spacing="-3">iFP</text><path d="${SWOOSH}"/></g></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  root.PW = root.PW || {};
  root.PW.brand = { BRAND, logoSVG, drawLogo, faviconURL };
  if (typeof module !== 'undefined') module.exports = root.PW.brand;
})(typeof window !== 'undefined' ? window : globalThis);
