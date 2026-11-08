import type { ActivityAction, ActivityEntity } from './activity-actions';

// Flat, never free text: numbers, enum values and (only for `fields`) a list of field names.
export type ActivityDetails = Record<string, number | string | string[]>;

// What a route knows once its handler has succeeded. `body` is the raw request body: mappers
// must read only the keys they allow and never copy it as a whole.
export interface ActivityContext {
  params: Record<string, string | string[] | undefined>;
  body: unknown;
  response: unknown;
}

export interface ActivityDraft {
  action: ActivityAction;
  entity: ActivityEntity;
  // Undefined when it could not be read; such a draft is dropped, not guessed.
  entityId: number | undefined;
  details?: ActivityDetails;
}

export interface ActivityRecord extends ActivityDraft {
  entityId: number;
}

// One request may describe several changes, so a mapper returns zero or more drafts.
export type ActivityMapper = (context: ActivityContext) => ActivityDraft[];
