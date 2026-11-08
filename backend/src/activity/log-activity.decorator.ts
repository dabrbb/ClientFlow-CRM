import { SetMetadata } from '@nestjs/common';

import type { ActivityMapper } from './activity.types';

export const ACTIVITY_MAPPER_KEY = 'activity:mapper';

// Marks a route whose successful calls are written to the activity log. The mapper (see
// activity-mappers.ts) turns the request and response into log records.
export const LogActivity = (mapper: ActivityMapper) => SetMetadata(ACTIVITY_MAPPER_KEY, mapper);
