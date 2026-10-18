/** User control positions are normalized; radii stay in readable CSS pixels. */
export type ControlPosition = { x: number; y: number; radius: number };
export type ControlLayout = [ControlPosition, ControlPosition, ControlPosition];
export const CONTROL_LAYOUT_KEY = 'allgames-control-layout-v1';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function parseControlLayout(raw: string | null): ControlLayout | null {
  try {
    const data: unknown = JSON.parse(raw ?? 'null');
    if (!Array.isArray(data) || data.length !== 3) return null;
    if (!data.every(p => p && typeof p === 'object' && ['x', 'y', 'radius'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])))) return null;
    return data.map(p => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), radius: clamp(p.radius, 36, 160) })) as ControlLayout;
  } catch { return null; }
}
export function fitControl(p: ControlPosition, width: number, height: number, top = 8) {
  const radius = Math.max(8, Math.min(p.radius, (width - 16) / 2, (height - top - 8) / 2));
  return { x: clamp(p.x * width, radius + 8, width - radius - 8), y: clamp(p.y * height, radius + top, height - radius - 8), radius };
}
export function copyControlLayout(layout: ControlLayout): ControlLayout {
  return layout.map(p => ({ ...p })) as ControlLayout;
}
/** Transaction keeps cancelled edits from mutating the live configuration. */
export class LayoutDraft {
  readonly value: ControlLayout;
  constructor(original: ControlLayout) { this.value = copyControlLayout(original); }
  commit(): ControlLayout { return copyControlLayout(this.value); }
}

export class ControlLayoutEditor {
  private root = document.createElement('div');
  private circles: HTMLDivElement[] = [];
  private draft: LayoutDraft;
  private selected = 0;
  private finished = false;
  private slider: HTMLInputElement;
  private output: HTMLElement;
  private drag: { pointer: number; index: number; resize: boolean; dx: number; dy: number; radius: number; distance: number } | null = null;
  private key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); this.finish(false); } };
  private resize = () => { this.drag = null; this.render(); };
  constructor(private area: HTMLElement, layout: ControlLayout, labels: string[], private done: (value: ControlLayout | null) => void) {
    this.draft = new LayoutDraft(layout);
    this.root.className = 'control-layout-editor ui-block';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Настройка джойстиков');
    this.root.innerHTML = '<div class="control-layout-toolbar"><b>Настройка джойстиков</b><span class="control-layout-help">Перетаскивай круги. Размер — маркером ↔ или ползунком.</span><label>Радиус <input type="range" min="36" max="160" step="1" aria-label="Радиус выбранного джойстика"><output></output></label><button type="button" class="btn" data-action="cancel">Отмена</button><button type="button" class="btn primary" data-action="ok">ОК</button></div>';
    this.slider = this.root.querySelector('input')!;
    this.output = this.root.querySelector('output')!;
    layout.forEach((_, index) => {
      const circle = document.createElement('div');
      circle.className = `control-layout-circle control-layout-circle-${index}`;
      circle.setAttribute('aria-label', labels[index]);
      const label = document.createElement('span'); label.textContent = labels[index]; circle.appendChild(label);
      const handle = document.createElement('button'); handle.className = 'control-layout-handle'; handle.textContent = '↔'; handle.setAttribute('aria-label', `Изменить размер: ${labels[index]}`); circle.appendChild(handle);
      circle.addEventListener('pointerdown', e => {
        if (this.drag || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        this.selected = index;
        const rect = this.area.getBoundingClientRect();
        const p = fitControl(this.draft.value[index], rect.width, rect.height, this.top());
        this.drag = { pointer: e.pointerId, index, resize: e.target === handle, dx: e.clientX - rect.left - p.x, dy: e.clientY - rect.top - p.y, radius: p.radius, distance: Math.hypot(e.clientX - rect.left - p.x, e.clientY - rect.top - p.y) };
        circle.setPointerCapture(e.pointerId);
        this.render();
      });
      circle.addEventListener('pointermove', e => {
        const d = this.drag;
        if (!d || e.pointerId !== d.pointer || index !== d.index) return;
        const rect = this.area.getBoundingClientRect();
        const p = this.draft.value[index];
        if (d.resize) {
          const fitted = fitControl(p, rect.width, rect.height, this.top());
          p.radius = clamp(d.radius + Math.hypot(e.clientX - rect.left - fitted.x, e.clientY - rect.top - fitted.y) - d.distance, 36, 160);
        } else {
          p.x = (e.clientX - rect.left - d.dx) / rect.width;
          p.y = (e.clientY - rect.top - d.dy) / rect.height;
        }
        this.normalize(index); this.render();
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) circle.addEventListener(event, e => { if ((e as PointerEvent).pointerId === this.drag?.pointer) this.drag = null; });
      this.circles.push(circle); this.root.appendChild(circle);
    });
    this.slider.addEventListener('input', () => { this.draft.value[this.selected].radius = Number(this.slider.value); this.normalize(this.selected); this.render(); });
    this.root.querySelector('[data-action="cancel"]')!.addEventListener('click', () => this.finish(false));
    this.root.querySelector('[data-action="ok"]')!.addEventListener('click', () => this.finish(true));
    area.appendChild(this.root);
    addEventListener('keydown', this.key); addEventListener('resize', this.resize);
    this.render();
  }
  private top() { return (this.root.querySelector('.control-layout-toolbar') as HTMLElement).offsetHeight + 12; }
  private normalize(index: number) {
    const rect = this.area.getBoundingClientRect();
    const p = fitControl(this.draft.value[index], rect.width, rect.height, this.top());
    this.draft.value[index] = { x: p.x / rect.width, y: p.y / rect.height, radius: p.radius };
  }
  private render() {
    const rect = this.area.getBoundingClientRect();
    this.circles.forEach((circle, i) => {
      const p = fitControl(this.draft.value[i], rect.width, rect.height, this.top());
      circle.style.left = `${p.x}px`; circle.style.top = `${p.y}px`;
      circle.style.width = circle.style.height = `${p.radius * 2}px`;
      circle.classList.toggle('selected', i === this.selected);
    });
    this.slider.value = String(Math.round(this.draft.value[this.selected].radius));
    this.output.textContent = `${this.slider.value}px`;
  }
  private finish(save: boolean) {
    if (this.finished) return;
    this.finished = true;
    if (save) this.circles.forEach((_, i) => this.normalize(i));
    removeEventListener('keydown', this.key); removeEventListener('resize', this.resize);
    this.root.remove(); this.done(save ? this.draft.commit() : null);
  }
}
