import { Injectable } from '@nestjs/common';

import { ActivityRepository } from './activity.repository';
import type { ActivityRecord } from './activity.types';
import { ActivityListResponseDto } from './dto/activity-response.dto';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';

@Injectable()
export class ActivityService {
  constructor(private readonly activityRepository: ActivityRepository) {}

  async record(userId: number, records: ActivityRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    await this.activityRepository.createMany(userId, records);
  }

  async getActivity(query: GetActivityQueryDto): Promise<ActivityListResponseDto> {
    const { page, limit, createdAfter, createdBefore, ...rest } = query;

    const filters = {
      ...rest,
      // Date-only strings parse as UTC midnight; the DTO guarantees every date-time has Z/offset.
      createdAfter: createdAfter ? new Date(createdAfter) : undefined,
      createdBefore: createdBefore ? new Date(createdBefore) : undefined,
    };

    const [entries, total] = await Promise.all([
      this.activityRepository.findAll(filters, (page - 1) * limit, limit),
      this.activityRepository.count(filters),
    ]);

    return new ActivityListResponseDto(entries, page, limit, total);
  }
}
