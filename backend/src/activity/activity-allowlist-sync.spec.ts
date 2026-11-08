import { IsOptional, IsString, getMetadataStorage } from 'class-validator';
import { UpdateClientDto } from 'src/clients/dto/update-client.dto';
import { UpdateDealDto } from 'src/deals/dto/update-deal.dto';
import { NoteContentDto } from 'src/notes/dto/note-content.dto';
import { UpdateTaskDto } from 'src/tasks/dto/update-task.dto';
import {
  CLIENT_FIELDS,
  DEAL_FIELDS,
  NOTE_FIELDS,
  TASK_FIELDS,
  dealUpdated,
  noteUpdated,
  taskUpdated,
  clientUpdated,
} from './activity-mappers';
import type { ActivityMapper } from './activity.types';

// Keeps the audit allow-list (activity-mappers.ts) in step with the update DTOs. The log never
// copies a DTO automatically, because a new field might hold personal data; instead, adding a
// field to one of these DTOs fails the test below until a person decides what the log does with
// it: add it to the allow-list (its NAME is then logged on update), or handle it separately.

// Every property that class-validator knows about, own and inherited. A field without any
// validator is unknown here, but the global ValidationPipe (whitelist) would strip it anyway.
const dtoFields = (dto: new () => object): string[] => [
  ...new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', true, false)
      .map((metadata) => metadata.propertyName),
  ),
];

interface AuditedDto {
  name: string;
  dto: new () => object;
  mapper: ActivityMapper;
  // Names that appear in an UPDATE record.
  listed: readonly string[];
  // Fields the mapper turns into their own action (CHANGE_STAGE, CHANGE_STATUS, ASSIGN). They are
  // named here on purpose, a second place to touch when the DTO changes, and must NOT appear in
  // an UPDATE record: their new value is logged by the dedicated action instead.
  separately: readonly string[];
  // A valid body for each separately handled field, to exercise the real mapper.
  separateBodies: Record<string, unknown>;
}

const AUDITED: AuditedDto[] = [
  {
    name: 'UpdateClientDto',
    dto: UpdateClientDto,
    mapper: clientUpdated,
    listed: CLIENT_FIELDS,
    separately: [],
    separateBodies: {},
  },
  {
    name: 'UpdateDealDto',
    dto: UpdateDealDto,
    mapper: dealUpdated,
    listed: DEAL_FIELDS,
    separately: ['stage'],
    separateBodies: { stage: 'WON' },
  },
  {
    name: 'UpdateTaskDto',
    dto: UpdateTaskDto,
    mapper: taskUpdated,
    listed: TASK_FIELDS,
    separately: ['status', 'assigneeId'],
    separateBodies: { status: 'DONE', assigneeId: 2 },
  },
  {
    name: 'NoteContentDto',
    dto: NoteContentDto,
    mapper: noteUpdated,
    listed: NOTE_FIELDS,
    separately: [],
    separateBodies: {},
  },
];

describe('activity allow-list stays in sync with the update DTOs', () => {
  describe.each(AUDITED)('$name', ({ dto, mapper, listed, separately, separateBodies }) => {
    it('has exactly the fields the audit knows about, no more and no fewer', () => {
      const known = new Set([...listed, ...separately]);
      const actual = new Set(dtoFields(dto));

      // "missing": a DTO field the audit has not been told about, so changes to it would go
      // unlogged. Add it to the matching *_FIELDS array in activity-mappers.ts, or handle it as
      // its own action and list it under `separately` above.
      // "stale": the audit lists a field the DTO no longer has.
      expect({
        missing: [...actual].filter((field) => !known.has(field)).sort(),
        stale: [...known].filter((field) => !actual.has(field)).sort(),
      }).toEqual({ missing: [], stale: [] });
    });

    it('logs every listed field by name in an UPDATE record', () => {
      const body = Object.fromEntries(listed.map((field) => [field, 'x']));

      const updates = mapper({ params: { id: '1' }, body, response: undefined }).filter(
        (draft) => draft.action === 'UPDATE',
      );

      expect(updates).toHaveLength(1);
      expect(updates[0].details).toEqual({ fields: [...listed] });
    });

    // Jest rejects an empty table, and some DTOs have no separately handled field.
    if (separately.length > 0) {
      it.each(separately)(
        'logs %s as its own action and keeps it out of the UPDATE field names',
        (field) => {
          const drafts = mapper({
            params: { id: '1' },
            body: { [field]: separateBodies[field] },
            response: undefined,
          });

          expect(drafts.length).toBeGreaterThan(0);
          drafts.forEach((draft) => {
            expect(draft.action).not.toBe('UPDATE');
          });
        },
      );
    }
  });

  it('never lists a credential-like field name in the allow-list', () => {
    const everyName = [
      ...CLIENT_FIELDS,
      ...DEAL_FIELDS,
      ...TASK_FIELDS,
      ...NOTE_FIELDS,
      ...AUDITED.flatMap((audited) => audited.separately),
    ];

    expect(everyName.filter((name) => /pass|token|secret|hash|credential/i.test(name))).toEqual([]);
  });

  describe('the field reader itself', () => {
    class Base {
      @IsString()
      inherited!: string;
    }

    class Child extends Base {
      @IsOptional()
      @IsString()
      own?: string;
    }

    it('sees own and inherited fields once each', () => {
      expect(dtoFields(Child).sort()).toEqual(['inherited', 'own']);
    });
  });
});
