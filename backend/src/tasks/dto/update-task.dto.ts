import { TaskStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  // ValidateIf instead of IsOptional: the assignee column is required, so null must be a 400.
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @IsPositive()
  assigneeId?: number;
}
