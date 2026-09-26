// The QR poster's SVG (../qr/_poster.ts) plans each line's width with a fixed
// estimate; a device whose font runs wider than planned would push a line past
// its edge. Each such line carries data-max (its widest, in the poster's
// millimetres): here, once the fonts are in, a line that is still too wide is
// squeezed to fit (textLength), as the canvas does for the PNG.
export function fitSvgText(svg: SVGSVGElement | null | undefined): void {
  if (!svg) return;
  const fit = () => {
    for (const t of svg.querySelectorAll<SVGTextElement>('text[data-max]')) {
      const max = Number(t.dataset.max);
      t.removeAttribute('textLength');
      t.removeAttribute('lengthAdjust');
      if (Number.isFinite(max) && t.getComputedTextLength() > max) {
        t.setAttribute('textLength', String(max));
        t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    }
  };
  fit();
  document.fonts?.ready.then(fit).catch(() => {});
}
