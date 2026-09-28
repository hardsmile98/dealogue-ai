import { useEffect, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { copyButtonStyles as styles } from './CopyButton.styles';

/** Сколько держим «Скопировано», прежде чем вернуть обычную иконку. */
const RESET_MS = 1500;

type CopyStatus = 'idle' | 'copied' | 'failed';

interface CopyButtonProps {
  /** Что положить в буфер обмена. */
  text: string;
  /** Подсказка и aria-label в обычном состоянии. */
  label?: string;
}

/**
 * Иконка «скопировать в буфер». Результат виден на самой кнопке: галочка
 * и «Скопировано» или, если браузер не дал доступа, «Не удалось скопировать».
 */
export function CopyButton({ text, label = 'Скопировать' }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async (button: HTMLElement) => {
    try {
      await writeClipboard(text, button);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  const title = {
    idle: label,
    copied: 'Скопировано',
    failed: 'Не удалось скопировать',
  }[status];

  return (
    <Tooltip title={title}>
      <IconButton
        size="small"
        aria-label={title}
        onClick={(event) => void copy(event.currentTarget)}
        sx={styles.button}
      >
        {status === 'copied' ? (
          <CheckIcon fontSize="inherit" color="success" />
        ) : (
          <ContentCopyIcon fontSize="inherit" />
        )}
      </IconButton>
    </Tooltip>
  );
}

/**
 * Clipboard API есть только на HTTPS и localhost и может быть запрещён
 * браузером — тогда копируем по-старому, через выделение в скрытом поле.
 */
async function writeClipboard(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Ниже — запасной путь.
  }

  // Поле ставим рядом с кнопкой, а не в конец body: фокус не покидает
  // окружение кнопки — всплывашки, которые закрываются по уходу фокуса
  // (закреплённая подсказка графика), остаются открытыми.
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  button.after(field);
  field.select();
  const copied = document.execCommand('copy');
  button.focus();
  field.remove();
  if (!copied) throw new Error('Браузер не дал скопировать');
}
