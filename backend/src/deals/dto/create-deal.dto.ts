import { DealStage } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { IsExpectedCloseDate } from './expected-close-date.decorator';

export class CreateDealDto {
  @IsString()
  @Length(2, 100)
  title!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value?: number;

  // The field may be left out, but an explicit null is rejected; IsOptional would let it through.
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(DealStage)
  stage?: DealStage;

  @IsExpectedCloseDate()
  expectedCloseDate?: string | null;

  @IsInt()
  @IsPositive()
  clientId!: number;
}
