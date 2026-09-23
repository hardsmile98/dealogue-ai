import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class StatsQueryDto {
  @Matches(DAY_KEY, { message: 'from: ожидается YYYY-MM-DD' })
  @IsString()
  from: string;

  @Matches(DAY_KEY, { message: 'to: ожидается YYYY-MM-DD' })
  @IsString()
  to: string;

  /** IANA-зона, в которой считать «день» (по умолчанию TELEGRAM_TIMEZONE). */
  @MaxLength(64)
  @IsString()
  @IsOptional()
  tz?: string;
}
