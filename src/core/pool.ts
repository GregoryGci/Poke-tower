/**
 * Réservoir d'objets réutilisables.
 *
 * Les projectiles et les effets naissent et meurent par dizaines par seconde.
 * Les allouer à la volée déclencherait des passages du ramasse-miettes en
 * pleine vague, visibles à l'écran. On les recycle donc.
 */

export interface Poolable {
  /** Remise à l'état neuf avant réutilisation. */
  reset(): void;
}

export class Pool<T extends Poolable> {
  private readonly free: T[] = [];
  private readonly active = new Set<T>();

  constructor(
    private readonly create: () => T,
    prefill = 0
  ) {
    for (let i = 0; i < prefill; i++) this.free.push(this.create());
  }

  get activeCount(): number {
    return this.active.size;
  }

  get pooledCount(): number {
    return this.free.length;
  }

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    item.reset();
    this.active.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.active.delete(item)) return;
    this.free.push(item);
  }

  /** Itère sur les objets actifs. Sûr si `release` est appelé pendant la boucle. */
  forEach(fn: (item: T) => void): void {
    for (const item of [...this.active]) fn(item);
  }

  releaseAll(): void {
    for (const item of this.active) this.free.push(item);
    this.active.clear();
  }
}
