/** Множество с ограничением размера: самые старые ключи вытесняются. */
export class LruSet {
  private readonly items = new Set<string>();

  constructor(private readonly capacity: number) {}

  add(key: string): void {
    if (this.items.has(key)) this.items.delete(key);
    this.items.add(key);
    if (this.items.size > this.capacity) {
      const oldest = this.items.values().next().value;
      if (oldest !== undefined) this.items.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.items.has(key);
  }
}
