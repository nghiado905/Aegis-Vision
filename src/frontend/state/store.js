export const state = {
  user: null,
  workspaceId: null,
  project: null,
  assets: [],
};

export function updateState(values) {
  Object.assign(state, values);
}
