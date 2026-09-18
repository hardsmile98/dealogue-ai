import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { getApiErrorMessage } from '@/shared/lib'
import { queryBoundaryStyles as styles } from './QueryBoundary.styles'

/** То, что возвращает любой хук-запрос RTK Query. */
interface QueryLike<T> {
  data?: T
  isLoading: boolean
  error?: unknown
}

interface QueryBoundaryProps<T> {
  query: QueryLike<T>
  /** Текст ошибки, если backend не прислал свой: «Не удалось загрузить факты». */
  errorText: string
  /** Высота заглушки на время загрузки либо готовый узел вместо неё. */
  skeleton?: number | ReactNode
  /** Что показать вместо содержимого, когда данные пришли пустыми. */
  empty?: ReactNode
  /** Когда считать данные пустыми. По умолчанию — пустой массив. */
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}

function isEmptyArray(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0
}

/**
 * Три состояния запроса — ошибка, загрузка, пусто — одинаково во всём
 * приложении. До этого каждая панель писала свой `if (error) return <Alert>`
 * и свой скелетон, и они расходились по текстам и размерам.
 *
 * Дети — функция от данных, поэтому внутри не нужны проверки на `undefined`.
 * Вызывать хуки в этой функции нельзя: это не компонент.
 */
export function QueryBoundary<T>({
  query,
  errorText,
  skeleton = 160,
  empty,
  isEmpty = isEmptyArray,
  children,
}: QueryBoundaryProps<T>) {
  if (query.error) {
    return <Alert severity="error">{getApiErrorMessage(query.error, errorText)}</Alert>
  }

  if (query.data === undefined) {
    if (!query.isLoading) return null
    return typeof skeleton === 'number' ? (
      <Skeleton variant="rounded" height={skeleton} />
    ) : (
      <>{skeleton}</>
    )
  }

  if (empty !== undefined && isEmpty(query.data)) {
    return typeof empty === 'string' ? (
      <Typography variant="body2" sx={styles.empty}>
        {empty}
      </Typography>
    ) : (
      <>{empty}</>
    )
  }

  return <>{children(query.data)}</>
}
