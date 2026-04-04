let _state = { friends: [], activities: [], events: [], user: null };
const _subs = new Set();

export function getState() { return _state; }
export function setState(partial) { _state = { ..._state, ...partial }; _subs.forEach(fn => fn(_state)); }
export function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); }
