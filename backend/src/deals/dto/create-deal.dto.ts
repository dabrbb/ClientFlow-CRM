import { DealStage } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { IsExpectedCloseDate } from './expected-close-date.decorator';

export class CreateDealDto {
  @IsString()
  @Length(2, 100)
  title!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value?: number;

  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @IsExpectedCloseDate()
  expectedCloseDate?: string | null;

  @IsInt()
  @IsPositive()
  clientId!: number;
}
