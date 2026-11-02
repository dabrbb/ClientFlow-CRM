import { ValidationPipe } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { UpdateTaskStatusDto } from './update-task-status.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (body: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(body, { type: 'body', metatype: UpdateTaskStatusDto });

describe('UpdateTaskStatusDto', () => {
  it.each(Object.values(TaskStatus))('accepts %s', async (status) => {
    const result = await parse({ status });

    expect(result).toBeInstanceOf(UpdateTaskStatusDto);
    expect(result).toHaveProperty('status', status);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a missing status', {}],
    ['status null', { status: null }],
    ['an empty string', { status: '' }],
    ['a lowercase status', { status: 'done' }],
    ['an unknown status', { status: 'ARCHIVED' }],
    ['a number', { status: 1 }],
    ['an array', { status: ['DONE'] }],
    ['an extra title field', { status: 'DONE', title: 'Sneaky rename' }],
    ['an extra assigneeId field', { status: 'DONE', assigneeId: 2 }],
  ])('rejects %s', async (_label, body) => {
    await expect(parse(body)).rejects.toMatchObject({ response: { statusCode: 400 } });
  });

  it('names the status field in the error', async () => {
    await expect(parse({ status: 'ARCHIVED' })).rejects.toHaveProperty(
      'response.message',
      expect.arrayContaining([
        expect.stringMatching(/^status must be one of the following values/),
      ]),
    );
  });
});
