export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartColumn {
  key: string;
  /** Подпись на оси X. */
  label: string;
  /** Заголовок всплывающей подсказки; по умолчанию label. */
  title?: string;
  values: Record<string, number>;
}
