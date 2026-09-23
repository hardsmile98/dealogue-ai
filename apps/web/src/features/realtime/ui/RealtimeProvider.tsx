import type { ReactNode } from 'react'
import { useRealtimeEvents } from '../model/useRealtimeEvents'

interface RealtimeProviderProps {
  children: ReactNode
}

/** Живые события для всей авторизованной части: инвалидация кэшей переписки. */
export function RealtimeProvider({ children }: RealtimeProviderProps) {
  useRealtimeEvents()
  return <>{children}</>
}
