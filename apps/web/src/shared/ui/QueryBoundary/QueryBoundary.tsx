import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { getApiErrorMessage } from '@/shared/lib';
import { queryBoundaryStyles as styles } from './QueryBoundary.styles';

/** То, что возвращает любой хук-запрос RTK Query. */
interface QueryLike<T> {
  data?: T;
  isLoading: boolean;
  error?: unknown;
  refetch?: () => unknown;
}

interface QueryBoundaryProps<T> {
  query: QueryLike<T>;
  /** Текст ошибки, если backend не прислал свой: «Не удалось загрузить факты». */
  errorText: string;
  /** Высота заглушки на время загрузки либо готовый узел вместо неё. */
  skeleton?: number | ReactNode;
  /** Что показать вместо содержимого, когда данные пришли пустыми. */
  empty?: ReactNode;
  /** Когда считать данные пустыми. По умолчанию — пустой массив. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

function isEmptyArray(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

/**
 * Три состояния запроса — ошибка, загрузка, пусто — одинаково во всём
 * приложении. До этого каждая панель писала свой `if (error) return <Alert>`
 * и свой скелетон, и они расходились по текстам и размерам.
 *
 * Если данные уже были, а упал фоновый перезапрос (опрос, фокус окна), —
 * данные остаются на экране, сверху предупреждение: пропадать из-за
 * секундного обрыва сети им незачем.
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
  const retry = query.refetch && (
    <Button color="inherit" size="small" onClick={() => void query.refetch?.()}>
      Повторить
    </Button>
  );

  if (query.data === undefined) {
    if (query.error) {
      return (
        <Alert severity="error" action={retry}>
          {getApiErrorMessage(query.error, errorText)}
        </Alert>
      );
    }
    if (!query.isLoading) return null;
    return typeof skeleton === 'number' ? (
      <Skeleton variant="rounded" height={skeleton} />
    ) : (
      <>{skeleton}</>
    );
  }

  const content =
    empty !== undefined && isEmpty(query.data) ? (
      typeof empty === 'string' ? (
        <Typography variant="body2" sx={styles.empty}>
          {empty}
        </Typography>
      ) : (
        empty
      )
    ) : (
      children(query.data)
    );

  if (!query.error) return <>{content}</>;

  return (
    <>
      <Alert severity="warning" action={retry} sx={styles.staleWarning}>
        Показаны прежние данные: {getApiErrorMessage(query.error, errorText)}
      </Alert>
      {content}
    </>
  );
}
