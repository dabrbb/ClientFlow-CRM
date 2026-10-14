import { TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';

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
}
