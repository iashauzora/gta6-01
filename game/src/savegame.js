// The save game: money, finished missions and settings in localStorage, so Continue on the
// start screen picks Dario's story up where the player left it. Storage failures (private
// windows, blocked cookies) degrade to a session-only game instead of an error.

const KEY = 'coral-bay-save-v1';

/** The default fresh-game state. */
export function freshSave() {
  return { money: 40, missionIndex: 0, hasGun: false, fares: 0, started: false };
}

/** Load the save, or a fresh one when there is none or it is unreadable. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw);
    const base = freshSave();
    return {
      money: Number.isFinite(data.money) ? data.money : base.money,
      missionIndex: Number.isInteger(data.missionIndex) ? data.missionIndex : 0,
      hasGun: data.hasGun === true,
      fares: Number.isInteger(data.fares) ? data.fares : 0,
      started: data.started === true,
    };
  } catch {
    return freshSave();
  }
}

/** Persist the save; silently a no-op when storage is unavailable. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Session-only game: nothing to do.
  }
}

/** Wipe the save (New Game). */
export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
