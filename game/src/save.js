// Solmar Bay — saving to this browser's localStorage: cash, mission progress,
// the player's spot and health. Storage can be off; then nothing persists.

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      playerX: state.playerX,
      playerZ: state.playerZ,
      health: state.health,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage off (private windows): the game still plays, it just does not save.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
