import { ClientStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// A date, or an instant with an explicit offset. A date-time without Z/offset is rejected
// because Date would read it in the server's local time zone.
const DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

export class GetClientsQueryDto {
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
  limit: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  // Only clients this user is assigned to. It narrows what the caller may already see, it never
  // widens it: a manager asking for a colleague gets the clients they share.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  managerId?: number;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(DATE_OR_INSTANT, {
    message:
      'createdAfter must be YYYY-MM-DD or an ISO 8601 date-time ending with Z or an offset like +03:00',
  })
  createdAfter?: string;

  @IsOptional()
  @IsIn(['name', 'createdAt'])
  sort: 'name' | 'createdAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
