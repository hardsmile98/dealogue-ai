/** Описание провайдера модели для страницы настроек. */
export interface AiProviderInfoDto {
  name: string;
  models: string[];
  configured: boolean;
  isDefault: boolean;
}
