import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class GetTasksQueryDto {
  @IsOptional()
  // Only the exact strings "true" and "false" are converted. @Type(() => Boolean) would turn
  // "false" (and any other non-empty string) into true.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  mine?: boolean;
}
