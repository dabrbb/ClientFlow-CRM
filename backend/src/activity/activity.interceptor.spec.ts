import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ActivityInterceptor } from './activity.interceptor';
import { ActivityService } from './activity.service';
import type { ActivityMapper } from './activity.types';
import { ACTIVITY_MAPPER_KEY } from './log-activity.decorator';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ActivityInterceptor', () => {
  const record = jest.fn<Promise<void>, Parameters<ActivityService['record']>>();
  const mapper = jest.fn<ReturnType<ActivityMapper>, Parameters<ActivityMapper>>();

  let interceptor: ActivityInterceptor;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  const handlerWithMapper = () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ACTIVITY_MAPPER_KEY, mapper, handler);
    return handler;
  };

  const makeContext = (
    handler: () => void,
    request: Record<string, unknown> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'PATCH',
          url: '/deals/7',
          params: { id: '7' },
          body: { stage: 'WON' },
          user: { sub: 2, email: 'm@example.com', role: Role.MANAGER },
          ...request,
        }),
      }),
    }) as unknown as ExecutionContext;

  const run = (context: ExecutionContext, handle: CallHandler['handle']) =>
    lastValueFrom(interceptor.intercept(context, { handle }));

  beforeEach(() => {
    jest.resetAllMocks();
    record.mockResolvedValue(undefined);
    mapper.mockReturnValue([{ action: 'CHANGE_STAGE', entity: 'Deal', entityId: 7 }]);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    interceptor = new ActivityInterceptor(new Reflector(), {
      record,
    } as unknown as ActivityService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes a route without @LogActivity through and logs nothing', async () => {
    const result = await run(
      makeContext(() => undefined),
      () => of('response'),
    );

    expect(result).toBe('response');
    expect(mapper).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('logs after a successful handler, as the signed-in user, and returns the response', async () => {
    const result = await run(makeContext(handlerWithMapper()), () => of({ id: 7 }));

    expect(result).toEqual({ id: 7 });
    expect(mapper).toHaveBeenCalledWith({
      params: { id: '7' },
      body: { stage: 'WON' },
      response: { id: 7 },
    });
    expect(record).toHaveBeenCalledWith(2, [
      { action: 'CHANGE_STAGE', entity: 'Deal', entityId: 7 },
    ]);
  });

  it('waits for the log to be written before the response is emitted', async () => {
    let release: () => void = () => undefined;
    record.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));

    let emitted = false;
    const pending = run(makeContext(handlerWithMapper()), () => of('response')).then((value) => {
      emitted = true;
      return value;
    });

    await flush();
    expect(record).toHaveBeenCalled();
    expect(emitted).toBe(false);

    release();
    await expect(pending).resolves.toBe('response');
    expect(emitted).toBe(true);
  });

  it('does not log when the handler fails, and passes the error on', async () => {
    const failure = new Error('409');

    await expect(
      run(makeContext(handlerWithMapper()), () => throwError(() => failure)),
    ).rejects.toBe(failure);

    expect(mapper).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('does not break the request when writing the log fails', async () => {
    record.mockRejectedValue(new Error('db down'));

    await expect(run(makeContext(handlerWithMapper()), () => of('response'))).resolves.toBe(
      'response',
    );

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('does not break the request when the mapper throws', async () => {
    mapper.mockImplementation(() => {
      throw new Error('bad mapper');
    });

    await expect(run(makeContext(handlerWithMapper()), () => of('response'))).resolves.toBe(
      'response',
    );

    expect(record).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('skips logging, with a warning, when there is no signed-in user', async () => {
    const result = await run(makeContext(handlerWithMapper(), { user: undefined }), () =>
      of('response'),
    );

    expect(result).toBe('response');
    expect(mapper).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops drafts whose entity id could not be read, keeps the rest, and warns', async () => {
    mapper.mockReturnValue([
      { action: 'CHANGE_STAGE', entity: 'Deal', entityId: undefined },
      { action: 'UPDATE', entity: 'Deal', entityId: 7, details: { fields: ['title'] } },
    ]);

    await run(makeContext(handlerWithMapper()), () => of('response'));

    expect(record).toHaveBeenCalledWith(2, [
      { action: 'UPDATE', entity: 'Deal', entityId: 7, details: { fields: ['title'] } },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('writes all records of one request in a single call', async () => {
    mapper.mockReturnValue([
      { action: 'ASSIGN', entity: 'Task', entityId: 4, details: { assigneeId: 9 } },
      { action: 'CHANGE_STATUS', entity: 'Task', entityId: 4, details: { status: 'DONE' } },
    ]);

    await run(makeContext(handlerWithMapper()), () => of('response'));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1]).toHaveLength(2);
  });
});
