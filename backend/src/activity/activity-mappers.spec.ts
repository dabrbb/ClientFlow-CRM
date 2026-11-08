import { ActivityContext, ActivityDraft } from './activity.types';
import {
  clientClaimed,
  clientCreated,
  clientUpdated,
  dealCreated,
  dealUpdated,
  managerAdded,
  managerRemoved,
  noteCreated,
  noteDeleted,
  noteUpdated,
  taskCreated,
  taskStatusChanged,
  taskUpdated,
} from './activity-mappers';

const ctx = (overrides: Partial<ActivityContext> = {}): ActivityContext => ({
  params: {},
  body: {},
  response: undefined,
  ...overrides,
});

describe('activity mappers', () => {
  describe('clients', () => {
    it('CREATE takes the id from the response and stores no details (no name)', () => {
      expect(
        clientCreated(ctx({ response: { id: 5, name: 'Secret Name', email: 'a@b.c' } })),
      ).toEqual([{ action: 'CREATE', entity: 'Client', entityId: 5 }]);
    });

    it('UPDATE stores only the names of the changed fields, never the values', () => {
      const drafts = clientUpdated(
        ctx({
          params: { id: '5' },
          body: { name: 'New Name', email: 'secret@example.com', phone: '+1 555 0100' },
        }),
      );

      expect(drafts).toEqual([
        {
          action: 'UPDATE',
          entity: 'Client',
          entityId: 5,
          details: { fields: ['name', 'email', 'phone'] },
        },
      ]);
      expect(JSON.stringify(drafts)).not.toMatch(/New Name|secret@|555/);
    });

    it('UPDATE counts null as a change and ignores an absent key', () => {
      const drafts = clientUpdated(ctx({ params: { id: '5' }, body: { phone: null } }));

      expect(drafts[0].details).toEqual({ fields: ['phone'] });
    });

    it('UPDATE records nothing when no known field was sent', () => {
      expect(clientUpdated(ctx({ params: { id: '5' }, body: {} }))).toEqual([]);
    });

    it('CLAIM has no details', () => {
      expect(clientClaimed(ctx({ params: { id: '5' } }))).toEqual([
        { action: 'CLAIM', entity: 'Client', entityId: 5 },
      ]);
    });

    it('ADD_MANAGER stores the user id from the body, on the client from the path', () => {
      expect(managerAdded(ctx({ params: { id: '5' }, body: { userId: 9 } }))).toEqual([
        { action: 'ADD_MANAGER', entity: 'Client', entityId: 5, details: { userId: 9 } },
      ]);
    });

    it('REMOVE_MANAGER stores the user id from the path', () => {
      expect(managerRemoved(ctx({ params: { id: '5', userId: '9' } }))).toEqual([
        { action: 'REMOVE_MANAGER', entity: 'Client', entityId: 5, details: { userId: 9 } },
      ]);
    });
  });

  describe('deals', () => {
    it('CREATE stores the client id', () => {
      expect(
        dealCreated(ctx({ response: { id: 7 }, body: { title: 'Secret deal', clientId: 3 } })),
      ).toEqual([{ action: 'CREATE', entity: 'Deal', entityId: 7, details: { clientId: 3 } }]);
    });

    it('a stage change is its own CHANGE_STAGE record with the new stage', () => {
      expect(dealUpdated(ctx({ params: { id: '7' }, body: { stage: 'WON' } }))).toEqual([
        { action: 'CHANGE_STAGE', entity: 'Deal', entityId: 7, details: { stage: 'WON' } },
      ]);
    });

    it('a stage together with other fields gives CHANGE_STAGE and UPDATE without duplication', () => {
      expect(
        dealUpdated(
          ctx({
            params: { id: '7' },
            body: { stage: 'LOST', title: 'x', expectedCloseDate: null },
          }),
        ),
      ).toEqual([
        { action: 'CHANGE_STAGE', entity: 'Deal', entityId: 7, details: { stage: 'LOST' } },
        {
          action: 'UPDATE',
          entity: 'Deal',
          entityId: 7,
          details: { fields: ['title', 'expectedCloseDate'] },
        },
      ]);
    });

    it('ignores an unknown stage value', () => {
      expect(dealUpdated(ctx({ params: { id: '7' }, body: { stage: 'HACKED' } }))).toEqual([]);
    });

    it('other fields alone give a plain UPDATE', () => {
      expect(dealUpdated(ctx({ params: { id: '7' }, body: { value: 10 } }))).toEqual([
        { action: 'UPDATE', entity: 'Deal', entityId: 7, details: { fields: ['value'] } },
      ]);
    });
  });

  describe('tasks', () => {
    it('CREATE stores assignee and deal, leaving out a missing deal', () => {
      expect(taskCreated(ctx({ response: { id: 4 }, body: { assigneeId: 2, dealId: 7 } }))).toEqual(
        [{ action: 'CREATE', entity: 'Task', entityId: 4, details: { assigneeId: 2, dealId: 7 } }],
      );
      expect(taskCreated(ctx({ response: { id: 4 }, body: { assigneeId: 2 } }))[0].details).toEqual(
        {
          assigneeId: 2,
        },
      );
    });

    it('a hand-over is its own ASSIGN record with the new assignee', () => {
      expect(taskUpdated(ctx({ params: { id: '4' }, body: { assigneeId: 9 } }))).toEqual([
        { action: 'ASSIGN', entity: 'Task', entityId: 4, details: { assigneeId: 9 } },
      ]);
    });

    it('one PATCH with assignee, status and other fields gives three separate records', () => {
      expect(
        taskUpdated(
          ctx({
            params: { id: '4' },
            body: { assigneeId: 9, status: 'DONE', title: 't', dueDate: null },
          }),
        ),
      ).toEqual([
        { action: 'ASSIGN', entity: 'Task', entityId: 4, details: { assigneeId: 9 } },
        { action: 'CHANGE_STATUS', entity: 'Task', entityId: 4, details: { status: 'DONE' } },
        {
          action: 'UPDATE',
          entity: 'Task',
          entityId: 4,
          details: { fields: ['title', 'dueDate'] },
        },
      ]);
    });

    it('does not turn an invalid assignee into a record', () => {
      expect(taskUpdated(ctx({ params: { id: '4' }, body: { assigneeId: '9' } }))).toEqual([]);
      expect(taskUpdated(ctx({ params: { id: '4' }, body: { assigneeId: null } }))).toEqual([]);
    });

    it('PATCH /tasks/:id/status gives CHANGE_STATUS', () => {
      expect(
        taskStatusChanged(ctx({ params: { id: '4' }, body: { status: 'IN_PROGRESS' } })),
      ).toEqual([
        {
          action: 'CHANGE_STATUS',
          entity: 'Task',
          entityId: 4,
          details: { status: 'IN_PROGRESS' },
        },
      ]);
    });
  });

  describe('notes', () => {
    it('CREATE stores the deal id and never the text', () => {
      const drafts = noteCreated(
        ctx({ params: { dealId: '7' }, response: { id: 3, content: 'Private text' } }),
      );

      expect(drafts).toEqual([
        { action: 'CREATE', entity: 'Note', entityId: 3, details: { dealId: 7 } },
      ]);
    });

    it('UPDATE names the field but not its text', () => {
      const drafts = noteUpdated(ctx({ params: { id: '3' }, body: { content: 'Private text' } }));

      expect(drafts).toEqual([
        { action: 'UPDATE', entity: 'Note', entityId: 3, details: { fields: ['content'] } },
      ]);
      expect(JSON.stringify(drafts)).not.toContain('Private');
    });

    it('DELETE has no details', () => {
      expect(noteDeleted(ctx({ params: { id: '3' } }))).toEqual([
        { action: 'DELETE', entity: 'Note', entityId: 3 },
      ]);
    });
  });

  describe('entity ids that cannot be read', () => {
    it('leaves entityId undefined for a response without a usable id, so the draft can be dropped', () => {
      expect(clientCreated(ctx({ response: undefined }))[0].entityId).toBeUndefined();
      expect(clientCreated(ctx({ response: { id: 'x' } }))[0].entityId).toBeUndefined();
      expect(noteDeleted(ctx({ params: { id: 'abc' } }))[0].entityId).toBeUndefined();
    });
  });

  describe('nothing outside the allow-list ever reaches a record', () => {
    const hostileBody = {
      password: 'hunter2-SECRET',
      refreshToken: 'tok-SECRET',
      accessToken: 'jwt-SECRET',
      passwordHash: 'hash-SECRET',
      email: 'secret-SECRET@example.com',
      phone: '555-SECRET',
      content: 'text-SECRET',
      name: 'name-SECRET',
      title: 'title-SECRET',
      description: 'desc-SECRET',
      stage: 'WON',
      status: 'DONE',
      assigneeId: 2,
      userId: 3,
      clientId: 4,
      dealId: 5,
      value: 6,
      expectedCloseDate: '2026-01-01',
      dueDate: '2026-01-01',
      extra: { nested: 'nested-SECRET' },
    };
    const context = ctx({
      params: { id: '1', userId: '3', dealId: '5' },
      body: hostileBody,
      response: { id: 1, password: 'resp-SECRET', passwordHash: 'resp-hash-SECRET' },
    });

    const everyMapper = {
      clientCreated,
      clientUpdated,
      clientClaimed,
      managerAdded,
      managerRemoved,
      dealCreated,
      dealUpdated,
      taskCreated,
      taskUpdated,
      taskStatusChanged,
      noteCreated,
      noteUpdated,
      noteDeleted,
    };

    it.each(Object.entries(everyMapper))(
      '%s never copies free text or secrets',
      (_name, mapper) => {
        const serialised = JSON.stringify(mapper(context));

        expect(serialised).not.toContain('SECRET');
      },
    );

    it.each(Object.entries(everyMapper))(
      '%s produces only flat details of numbers, strings and field names',
      (_name, mapper) => {
        mapper(context).forEach((draft: ActivityDraft) => {
          Object.values(draft.details ?? {}).forEach((value) => {
            const ok =
              typeof value === 'number' ||
              typeof value === 'string' ||
              (Array.isArray(value) && value.every((item) => typeof item === 'string'));
            expect(ok).toBe(true);
          });
        });
      },
    );
  });
});
