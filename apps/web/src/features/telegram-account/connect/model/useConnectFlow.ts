import { useState } from 'react';
import { getApiErrorMessage } from '@/shared/lib';
import type { TelegramAccount } from '@/entities/telegram-account';
import {
  useSendCodeMutation,
  useSignInMutation,
  useSubmitPasswordMutation,
} from '../api/connectApi';

export type ConnectStep = 'phone' | 'code' | 'password' | 'done';
export type InputStep = Exclude<ConnectStep, 'done'>;

/** Меньше цифр в номере не бывает — кнопку «Получить код» не включаем. */
const MIN_PHONE_DIGITS = 10;
/** Код из Telegram — обычно 5 цифр, иногда 6. */
const MIN_CODE_LENGTH = 5;
export const MAX_CODE_LENGTH = 6;

interface ConnectFlowOptions {
  initialPhone: string;
  onConnected?: (account: TelegramAccount) => void;
}

/**
 * Состояние входа в Telegram: номер → код → облачный пароль (если включена
 * 2FA) → готово. Хук держит поля, текущий шаг и ошибку последнего запроса;
 * разметка шагов — в ui/steps.
 */
export function useConnectFlow({
  initialPhone,
  onConnected,
}: ConnectFlowOptions) {
  const [step, setStep] = useState<ConnectStep>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCodeRaw] = useState('');
  const [password, setPassword] = useState('');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [account, setAccount] = useState<TelegramAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** В поле кода — только цифры и не длиннее кода. */
  const setCode = (value: string) =>
    setCodeRaw(value.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH));

  const [sendCode, sendCodeState] = useSendCodeMutation();
  const [signIn, signInState] = useSignInMutation();
  const [submitPassword, submitPasswordState] = useSubmitPasswordMutation();
  const isLoading =
    sendCodeState.isLoading ||
    signInState.isLoading ||
    submitPasswordState.isLoading;

  const steps: InputStep[] = passwordRequired
    ? ['phone', 'code', 'password']
    : ['phone', 'code'];
  const activeIndex = step === 'done' ? steps.length : steps.indexOf(step);

  const canSubmit =
    (step === 'phone' && phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS) ||
    (step === 'code' && code.length >= MIN_CODE_LENGTH) ||
    (step === 'password' && password.length > 0);

  const finish = (connected: TelegramAccount) => {
    setAccount(connected);
    setStep('done');
    onConnected?.(connected);
  };

  const requestCode = async () => {
    const result = await sendCode({ phone: phone.trim() }).unwrap();
    setAttemptId(result.attemptId);
    setPhone(result.phone);
    setCode('');
    setStep('code');
  };

  const confirmCode = async (attempt: string) => {
    const result = await signIn({ attemptId: attempt, code }).unwrap();
    if (result.status === 'password_required') {
      setPasswordRequired(true);
      setStep('password');
      return;
    }
    finish(result.account);
  };

  const confirmPassword = async (attempt: string) => {
    const result = await submitPassword({
      attemptId: attempt,
      password,
    }).unwrap();
    finish(result.account);
  };

  /** Отправить текущий шаг. Ошибка запроса остаётся в `error`, шаг не меняется. */
  const submit = async () => {
    if (!canSubmit || isLoading) return;
    setError(null);
    try {
      if (step === 'phone') await requestCode();
      else if (step === 'code' && attemptId) await confirmCode(attemptId);
      else if (step === 'password' && attemptId) {
        await confirmPassword(attemptId);
      }
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  };

  const backToPhone = () => {
    setError(null);
    setStep('phone');
  };

  return {
    step,
    steps,
    activeIndex,
    phone,
    setPhone,
    code,
    setCode,
    password,
    setPassword,
    account,
    error,
    clearError: () => setError(null),
    isLoading,
    canSubmit,
    submit,
    backToPhone,
  };
}
