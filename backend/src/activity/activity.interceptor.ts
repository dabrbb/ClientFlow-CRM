import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, mergeMap } from 'rxjs';

import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import { ActivityService } from './activity.service';
import type { ActivityMapper, ActivityRecord } from './activity.types';
import { ACTIVITY_MAPPER_KEY } from './log-activity.decorator';

// Global, but it only acts on routes marked with @LogActivity. It runs after the guards (so
// req.user is set) and only logs when the handler succeeded: a failed request changed nothing.
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly activityService: ActivityService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const mapper = this.reflector.get<ActivityMapper | undefined>(
      ACTIVITY_MAPPER_KEY,
      context.getHandler(),
    );

    if (!mapper) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // mergeMap with an async function (not tap): the response waits until the log is written.
    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        await this.record(mapper, request, response);
        return response;
      }),
    );
  }

  // The action has already happened, so a logging failure must never turn into an error response.
  private async record(
    mapper: ActivityMapper,
    request: AuthenticatedRequest,
    response: unknown,
  ): Promise<void> {
    try {
      const userId: unknown = request.user?.sub;

      if (typeof userId !== 'number') {
        this.logger.warn(
          `Activity not logged: no signed-in user on ${request.method} ${request.url}`,
        );
        return;
      }

      const drafts = mapper({ params: request.params, body: request.body, response });
      const records = drafts.filter((draft): draft is ActivityRecord =>
        Number.isInteger(draft.entityId),
      );

      if (records.length < drafts.length) {
        this.logger.warn(
          `Activity partly dropped: no entity id for ${request.method} ${request.url}`,
        );
      }

      await this.activityService.record(userId, records);
    } catch (error) {
      this.logger.error(
        `Activity not logged for ${request.method} ${request.url}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
