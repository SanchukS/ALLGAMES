/** Resolution budget in CSS pixels; UI remains at its original sharpness. */
export function renderPixelRatio(low: boolean, mobile: boolean, dpr: number, longestSide: number, scale = 1) {
  const cap = low ? (mobile ? 1280 : 1600) : 2560;
  return Math.max(.5, Math.min(dpr, low ? 1 : 2, cap / Math.max(1, longestSide)) * scale);
}

/** Slow sustained frames trigger a step down; one loading spike never changes quality. */
export class AdaptiveQuality {
  private seconds = 0;
  private frames = 0;
  private cooldown = 5;
  reset() { this.seconds = this.frames = 0; this.cooldown = 5; }
  sample(dt: number, low: boolean, scale: number, active: boolean): 'low' | 'reduce' | null {
    if (!active || !Number.isFinite(dt) || dt <= 0 || dt > 1) { this.seconds = this.frames = 0; return null; }
    if (this.cooldown > 0) { this.cooldown -= dt; return null; }
    this.seconds += dt; this.frames++;
    if (this.seconds < 3) return null;
    const fps = this.frames / this.seconds;
    this.seconds = this.frames = 0;
    if (fps >= 26) return null;
    this.cooldown = 5;
    return !low ? 'low' : scale > .6 ? 'reduce' : null;
  }
}
