/** id обёртки хода в журнале — чтобы прокрутить к нему по клику на сообщение агента. */
export function turnAnchorId(turnId: string): string {
  return `turn-${turnId}`;
}
