import { DealStage, TaskStatus } from '@prisma/client';

import type { ActivityEntity } from './activity-actions';
import type {
  ActivityContext,
  ActivityDetails,
  ActivityDraft,
  ActivityMapper,
} from './activity.types';

// This file is the audit policy: for every logged route it states which facts may be stored.
// Anything not read here (emails, phones, note text, titles, passwords) never reaches the log.
// Updates store only the NAMES of the changed fields, never their values.

export const CLIENT_FIELDS = ['name', 'email', 'phone'] as const;
export const DEAL_FIELDS = ['title', 'value', 'expectedCloseDate'] as const;
export const TASK_FIELDS = ['title', 'description', 'dueDate'] as const;
export const NOTE_FIELDS = ['content'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asId = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

const asEnum = <T extends string>(value: unknown, allowed: Record<string, T>): T | undefined =>
  typeof value === 'string' ? Object.values(allowed).find((option) => option === value) : undefined;

const bodyOf = (context: ActivityContext): Record<string, unknown> =>
  isRecord(context.body) ? context.body : {};

// A key counts as changed when the request carries it, even as null (null clears a value).
const present = (body: Record<string, unknown>, key: string): boolean =>
  Object.keys(body).includes(key) && body[key] !== undefined;

const changedFields = (body: Record<string, unknown>, allowed: readonly string[]): string[] =>
  allowed.filter((key) => present(body, key));

const paramId = (context: ActivityContext, name: string): number | undefined => {
  const raw = context.params[name];
  return typeof raw === 'string' ? asId(Number(raw)) : undefined;
};

const responseId = (context: ActivityContext): number | undefined =>
  isRecord(context.response) ? asId(context.response.id) : undefined;

// Drops undefined values and returns undefined when nothing is left.
const details = (
  facts: Record<string, number | string | undefined>,
): ActivityDetails | undefined => {
  const entries = Object.entries(facts).filter(
    (entry): entry is [string, number | string] => entry[1] !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const update = (
  entity: ActivityEntity,
  entityId: number | undefined,
  fields: string[],
): ActivityDraft[] =>
  fields.length > 0 ? [{ action: 'UPDATE', entity, entityId, details: { fields } }] : [];

export const clientCreated: ActivityMapper = (context) => [
  { action: 'CREATE', entity: 'Client', entityId: responseId(context) },
];

export const clientUpdated: ActivityMapper = (context) =>
  update('Client', paramId(context, 'id'), changedFields(bodyOf(context), CLIENT_FIELDS));

export const clientClaimed: ActivityMapper = (context) => [
  { action: 'CLAIM', entity: 'Client', entityId: paramId(context, 'id') },
];

export const managerAdded: ActivityMapper = (context) => [
  {
    action: 'ADD_MANAGER',
    entity: 'Client',
    entityId: paramId(context, 'id'),
    details: details({ userId: asId(bodyOf(context).userId) }),
  },
];

export const managerRemoved: ActivityMapper = (context) => [
  {
    action: 'REMOVE_MANAGER',
    entity: 'Client',
    entityId: paramId(context, 'id'),
    details: details({ userId: paramId(context, 'userId') }),
  },
];

export const dealCreated: ActivityMapper = (context) => [
  {
    action: 'CREATE',
    entity: 'Deal',
    entityId: responseId(context),
    details: details({ clientId: asId(bodyOf(context).clientId) }),
  },
];

export const dealUpdated: ActivityMapper = (context) => {
  const body = bodyOf(context);
  const entityId = paramId(context, 'id');
  const stage = asEnum(body.stage, DealStage);

  const drafts: ActivityDraft[] = [];

  if (stage) {
    drafts.push({ action: 'CHANGE_STAGE', entity: 'Deal', entityId, details: { stage } });
  }

  return [...drafts, ...update('Deal', entityId, changedFields(body, DEAL_FIELDS))];
};

export const taskCreated: ActivityMapper = (context) => {
  const body = bodyOf(context);

  return [
    {
      action: 'CREATE',
      entity: 'Task',
      entityId: responseId(context),
      details: details({ assigneeId: asId(body.assigneeId), dealId: asId(body.dealId) }),
    },
  ];
};

// One PATCH may hand the task over, change its status and edit other fields at once; each
// meaning gets its own record, so the history of hand-overs can be filtered by action.
export const taskUpdated: ActivityMapper = (context) => {
  const body = bodyOf(context);
  const entityId = paramId(context, 'id');
  const assigneeId = asId(body.assigneeId);
  const status = asEnum(body.status, TaskStatus);

  const drafts: ActivityDraft[] = [];

  if (assigneeId) {
    drafts.push({ action: 'ASSIGN', entity: 'Task', entityId, details: { assigneeId } });
  }

  if (status) {
    drafts.push({ action: 'CHANGE_STATUS', entity: 'Task', entityId, details: { status } });
  }

  return [...drafts, ...update('Task', entityId, changedFields(body, TASK_FIELDS))];
};

export const taskStatusChanged: ActivityMapper = (context) => {
  const status = asEnum(bodyOf(context).status, TaskStatus);

  return status
    ? [
        {
          action: 'CHANGE_STATUS',
          entity: 'Task',
          entityId: paramId(context, 'id'),
          details: { status },
        },
      ]
    : [];
};

export const noteCreated: ActivityMapper = (context) => [
  {
    action: 'CREATE',
    entity: 'Note',
    entityId: responseId(context),
    details: details({ dealId: paramId(context, 'dealId') }),
  },
];

export const noteUpdated: ActivityMapper = (context) =>
  update('Note', paramId(context, 'id'), changedFields(bodyOf(context), NOTE_FIELDS));

export const noteDeleted: ActivityMapper = (context) => [
  { action: 'DELETE', entity: 'Note', entityId: paramId(context, 'id') },
];
