import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import type { SvgIconComponent } from '@mui/icons-material'

export interface BrandHighlight {
  icon: SvgIconComponent
  title: string
  text: string
}

/** Текст-заглушка для брендовой колонки — заменить на реальный, когда появится. */
export const BRAND_HIGHLIGHTS: BrandHighlight[] = [
  {
    icon: ForumOutlinedIcon,
    title: 'Все диалоги в одном месте',
    text: 'История переписки и контекст всегда под рукой.',
  },
  {
    icon: BoltOutlinedIcon,
    title: 'Ответы за секунды',
    text: 'ИИ подсказывает следующий шаг, пока клиент на связи.',
  },
  {
    icon: ShieldOutlinedIcon,
    title: 'Данные под контролем',
    text: 'Доступы по ролям и журнал действий команды.',
  },
]
