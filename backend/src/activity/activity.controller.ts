import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ActivityService } from './activity.service';
import { ActivityListResponseDto } from './dto/activity-response.dto';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';

// Read-only on purpose: the log has no create, update or delete endpoint.
@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async findAll(@Query() query: GetActivityQueryDto): Promise<ActivityListResponseDto> {
    return this.activityService.getActivity(query);
  }
}
