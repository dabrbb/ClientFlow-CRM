import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Matches, Max, Min } from 'class-validator';
import { DATE_OR_INSTANT } from 'src/common/validation/date-or-instant';
import { ACTIVITY_ACTIONS, ACTIVITY_ENTITIES } from '../activity-actions';
import type { ActivityAction, ActivityEntity } from '../activity-actions';

const DATE_MESSAGE =
  'must be YYYY-MM-DD or an ISO 8601 date-time ending with Z or an offset like +03:00';

export class GetActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(ACTIVITY_ENTITIES)
  entity?: ActivityEntity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId?: number;

  @IsOptional()
  @IsIn(ACTIVITY_ACTIONS)
  action?: ActivityAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  // Inclusive: createdAt >= createdAfter.
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(DATE_OR_INSTANT, { message: `createdAfter ${DATE_MESSAGE}` })
  createdAfter?: string;

  // Exclusive: createdAt < createdBefore.
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(DATE_OR_INSTANT, { message: `createdBefore ${DATE_MESSAGE}` })
  createdBefore?: string;
}
