/**
 * Предохранитель на провайдера: после N ошибок подряд запросы не идут
 * `cooldownMs`, затем пропускается один пробный (half-open). Успех закрывает
 * цепь, ошибка — снова открывает.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probing = false;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 2 * 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Можно ли сейчас делать запрос. */
  allow(): boolean {
    if (this.openedAt === null) return true;
    if (this.now() - this.openedAt < this.cooldownMs) return false;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.probing = false;
  }

  onFailure(): void {
    this.failures += 1;
    this.probing = false;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  get isOpen(): boolean {
    return this.openedAt !== null && this.now() - this.openedAt < this.cooldownMs;
  }

  /** Когда можно повторить (для переноса job'ов). */
  get retryAfterMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }

  get state(): { failures: number; open: boolean; retryAfterMs: number } {
    return { failures: this.failures, open: this.isOpen, retryAfterMs: this.retryAfterMs };
  }
}
