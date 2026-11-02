import { ValidationPipe } from '@nestjs/common';
import { GetTasksQueryDto } from './get-tasks-query.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (query: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(query, { type: 'query', metatype: GetTasksQueryDto });

const rejectedFor = { response: { statusCode: 400 } };

describe('GetTasksQueryDto', () => {
  describe('mine', () => {
    it('is optional', async () => {
      const result = await parse({});

      expect(result).toBeInstanceOf(GetTasksQueryDto);
      expect(result).toHaveProperty('mine', undefined);
    });

    it('turns "true" into the boolean true', async () => {
      await expect(parse({ mine: 'true' })).resolves.toHaveProperty('mine', true);
    });

    it('turns "false" into the boolean false, not true', async () => {
      await expect(parse({ mine: 'false' })).resolves.toHaveProperty('mine', false);
    });

    it.each(['1', '0', 'TRUE', 'True', 'FALSE', 'yes', 'no', 'on', ' true', 'true ', ''])(
      'rejects "%s"',
      async (value) => {
        await expect(parse({ mine: value })).rejects.toMatchObject(rejectedFor);
      },
    );

    it.each([[['true', 'true']], [['true', 'false']], [['false']]])(
      'rejects the repeated parameter %j (an array)',
      async (value) => {
        await expect(parse({ mine: value })).rejects.toMatchObject(rejectedFor);
      },
    );

    it('names mine in the error', async () => {
      await expect(parse({ mine: 'yes' })).rejects.toHaveProperty(
        'response.message',
        expect.arrayContaining([expect.stringMatching(/^mine /)]),
      );
    });
  });

  describe('unknown parameters', () => {
    it.each(['userId', 'assigneeId', 'assignee', 'foo'])('rejects %s', async (name) => {
      await expect(parse({ [name]: '5' })).rejects.toMatchObject(rejectedFor);
    });

    it('rejects an unknown parameter next to a valid mine', async () => {
      await expect(parse({ mine: 'true', userId: '99' })).rejects.toMatchObject(rejectedFor);
    });
  });
});
