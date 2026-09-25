/** Диапазон оси с подписчиками (общий для связанных графиков). */
export class Range {
  min: number;
  max: number;
  private listeners = new Set<() => void>();

  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
  }

  get span(): number {
    return this.max - this.min;
  }

  set(min: number, max: number): void {
    if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return;
    if (min === this.min && max === this.max) return;
    this.min = min;
    this.max = max;
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** Группа графиков с общей осью времени, наведением и курсором. */
export class LinkGroup {
  readonly x: Range;
  /** Время под указателем мыши (в единицах оси), или null. */
  hoverX: number | null = null;
  private listeners = new Set<() => void>();

  constructor(x: Range) {
    this.x = x;
  }

  setHover(x: number | null): void {
    if (x === this.hoverX) return;
    this.hoverX = x;
    this.notify();
  }

  notify(): void {
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
