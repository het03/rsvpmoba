// Just enough of expo-notifications for goalNotifier: records what the app asks for, and lets a test choose the answers.
export const state = {
  permission: { granted: true, canAskAgain: true },
  requestResult: { granted: true },
  throwOn: null,
  calls: [],
};

export const AndroidImportance = { DEFAULT: 3 };

const record = (...call) => state.calls.push(call);

export function reset() {
  state.permission = { granted: true, canAskAgain: true };
  state.requestResult = { granted: true };
  state.throwOn = null;
  state.calls = [];
}

export async function getPermissionsAsync() {
  record('getPermissions');
  if (state.throwOn === 'getPermissions') throw new Error('boom');
  return state.permission;
}

export async function requestPermissionsAsync() {
  record('requestPermissions');
  return state.requestResult;
}

export async function setNotificationChannelAsync(id, config) {
  record('channel', id, config);
}

export function setNotificationHandler(handler) {
  record('handler', handler);
}

export async function scheduleNotificationAsync(request) {
  record('schedule', request);
  if (state.throwOn === 'schedule') throw new Error('boom');
}
