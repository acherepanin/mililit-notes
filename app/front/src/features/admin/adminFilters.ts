export type ActivitySort = 'newest' | 'oldest';
export type ActivityFilterKey = 'user' | 'action' | 'actor' | 'target';
export type ActivityFilters = Record<ActivityFilterKey, string[]>;

export const emptyActivityFilters: ActivityFilters = {
  user: [],
  action: [],
  actor: [],
  target: [],
};
