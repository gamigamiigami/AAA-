/**
 * Persistence. Deliberately tiny and defensive: localStorage throws in private
 * browsing on some mobile browsers, and crashing on the title screen because a
 * high score could not be read would be an absurd way to lose a player.
 */

const KEY = 'microgame-rush.v1';

const DEFAULTS = {
  best: { town: 0, neon: 0, forest: 0 },
  plays: 0,
  muted: false,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      best: { ...DEFAULTS.best, ...(parsed.best ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function createSave() {
  const data = read();

  const flush = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — the session still plays, it just won't persist */
    }
  };

  return {
    get data() {
      return data;
    },
    best(stageId) {
      return data.best[stageId] ?? 0;
    },
    /** @returns {boolean} true when this run set a new record */
    submit(stageId, score) {
      data.plays++;
      const prev = data.best[stageId] ?? 0;
      const record = score > prev;
      if (record) data.best[stageId] = score;
      flush();
      return record;
    },
    setMuted(v) {
      data.muted = v;
      flush();
    },
  };
}
