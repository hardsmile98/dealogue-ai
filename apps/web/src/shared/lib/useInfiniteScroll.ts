import { useEffect, useRef } from 'react'

interface InfiniteScrollOptions {
  /** Есть ли что догружать. */
  hasMore: boolean
  /** Идёт загрузка — новую не начинаем, пока не закончится текущая. */
  isLoading: boolean
  onLoadMore: () => void
  /** С какого края догружать: список — снизу, переписка — сверху. */
  edge?: 'top' | 'bottom'
  /** За сколько пикселей до края начинать догрузку. */
  threshold?: number
}

/**
 * Догрузка при прокрутке: `rootRef` вешается на прокручиваемый контейнер,
 * `sentinelRef` — на пустой элемент у края, с которого догружаем. Когда
 * маяк подходит к видимой области ближе `threshold`, вызывается `onLoadMore`.
 *
 * Наблюдатель пересоздаётся после каждой загрузки: если новая страница не
 * заполнила контейнер и маяк всё ещё виден, догрузка продолжится сама.
 */
export function useInfiniteScroll<TRoot extends HTMLElement>({
  hasMore,
  isLoading,
  onLoadMore,
  edge = 'bottom',
  threshold = 400,
}: InfiniteScrollOptions) {
  const rootRef = useRef<TRoot>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  useEffect(() => {
    const root = rootRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || isLoading) return

    const rootMargin = edge === 'top' ? `${threshold}px 0px 0px 0px` : `0px 0px ${threshold}px 0px`
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current()
      },
      { root, rootMargin },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, edge, threshold])

  return { rootRef, sentinelRef }
}
