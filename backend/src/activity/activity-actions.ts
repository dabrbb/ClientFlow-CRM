// The single place that lists what the log may contain. The query DTO validates against these
// arrays and the mappers use their types, so a new action or entity is added here only.
export const ACTIVITY_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'CHANGE_STAGE',
  'CHANGE_STATUS',
  'ASSIGN',
  'CLAIM',
  'ADD_MANAGER',
  'REMOVE_MANAGER',
] as const;

export const ACTIVITY_ENTITIES = ['Client', 'Deal', 'Task', 'Note'] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];
