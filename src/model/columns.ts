/** Набор растущих числовых столбцов одинаковой длины (история моделирования). */
export class Columns<K extends string> {
  readonly keys: readonly K[];
  length = 0;
  private cap: number;
  private data: Record<K, Float64Array>;

  constructor(keys: readonly K[], capacity = 1024) {
    this.keys = keys;
    this.cap = capacity;
    this.data = {} as Record<K, Float64Array>;
    for (const k of keys) this.data[k] = new Float64Array(capacity);
  }

  /** Массив значений столбца; действителен до следующего push (может быть перевыделен). */
  col(key: K): Float64Array {
    return this.data[key];
  }

  push(row: Record<K, number>): number {
    const i = this.append();
    for (const k of this.keys) this.data[k][i] = row[k];
    return i;
  }

  /** Добавляет строку (значения заполняет вызывающий через col(key)[i]) и возвращает её индекс. */
  append(): number {
    if (this.length >= this.cap) this.grow();
    return this.length++;
  }

  /** Индекс первой строки, у которой значение столбца key не меньше x (столбец отсортирован). */
  lowerBound(key: K, x: number): number {
    const a = this.data[key];
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (a[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  clear(): void {
    this.length = 0;
  }

  private grow(): void {
    this.cap *= 2;
    for (const k of this.keys) {
      const next = new Float64Array(this.cap);
      next.set(this.data[k]);
      this.data[k] = next;
    }
  }
}
