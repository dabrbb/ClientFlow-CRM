import { TaskStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @Length(2, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsInt()
  @IsPositive()
  assigneeId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dealId?: number;
}
