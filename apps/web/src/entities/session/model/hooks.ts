import { useSelector } from 'react-redux'
import {
  selectCurrentUser,
  selectIsAuthenticated,
  selectSession,
} from './selectors'

export const useSession = () => useSelector(selectSession)

export const useCurrentUser = () => useSelector(selectCurrentUser)

export const useIsAuthenticated = () => useSelector(selectIsAuthenticated)
