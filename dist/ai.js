// Reads a student's typed request with Chrome's built-in on-device AI (the Prompt API, `LanguageModel`).
// Privacy: only the typed sentence goes to the model, and the model runs inside Chrome on this computer.
// The model output is untrusted: sanitize() clamps and validates it, and the planner itself stays deterministic code.
const SYSTEM = [
  'You convert a college student\'s class-scheduling request into JSON settings. Output JSON only.',
  'maxUnits: the most units they will take, as an integer. 0 if not stated. "under N units" means N-1.',
  'avoidBefore: the earliest start time they accept, 24-hour HH:MM. "avoid classes before 10 am" is "10:00". Empty string if not stated.',
  'avoidAfter: the latest end time they accept, 24-hour HH:MM. "nothing after 5 pm" is "17:00". Empty string if not stated.',
  'prioritizePrerequisites: true only if they want courses that unlock later courses first.',
  'geCategory: the general education category letter A to H they asked for (for example "GE-B" is "B"). Empty string if none.',
  'preferHighlyRated: true if they want a highly rated professor or instructor.',
  'Never invent preferences that were not stated.',
].join('\n');

export const SCHEMA = {
  type: 'object',
  properties: {
    maxUnits: { type: 'integer' },
    avoidBefore: { type: 'string' },
    avoidAfter: { type: 'string' },
    prioritizePrerequisites: { type: 'boolean' },
    geCategory: { type: 'string' },
    preferHighlyRated: { type: 'boolean' },
  },
  required: ['maxUnits', 'avoidBefore', 'avoidAfter', 'prioritizePrerequisites', 'geCategory', 'preferHighlyRated'],
  additionalProperties: false,
};

const toMinutes = text => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 360 && minutes <= 1320 ? minutes : null; // 6:00 AM to 10:00 PM
};

// Turn raw model output into the planner's preference patch. Anything odd is dropped, never guessed.
export function sanitize(raw) {
  let value = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { return {}; } }
  if (!value || typeof value !== 'object') return {};
  const patch = {};
  const units = Number(value.maxUnits);
  if (Number.isInteger(units) && units >= 8 && units <= 18) patch.units = units;
  const before = toMinutes(value.avoidBefore);
  if (before != null) patch.morning = before;
  const after = toMinutes(value.avoidAfter);
  if (after != null) patch.latest = after;
  if (value.prioritizePrerequisites === true) patch.sequence = true;
  const letter = /^(?:GE-?)?([A-H])$/i.exec(String(value.geCategory ?? '').trim());
  if (letter) patch.geCategory = `GE-${letter[1].toUpperCase()}`;
  if (value.preferHighlyRated === true) patch.ratingFirst = true;
  return patch;
}

export async function aiAvailability(model = globalThis.LanguageModel) {
  if (failed) return 'unavailable';
  if (!model || typeof model.availability !== 'function') return 'unsupported';
  try { return await model.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }); }
  catch { try { return await model.availability(); } catch { return 'unsupported'; } }
}

let session = null;
let failed = false; // once Chrome AI fails to start, stop retrying this page load

// Returns { patch, reader: 'Chrome AI' } or throws. onProgress(0..1) reports a first-time model download.
export async function interpretWithAI(text, { model = globalThis.LanguageModel, onProgress, timeoutMs = 20000 } = {}) {
  const status = await aiAvailability(model);
  if (status === 'unsupported' || status === 'unavailable') throw new Error(`Chrome AI is ${status}`);
  if (!session) {
    const options = {
      initialPrompts: [{ role: 'system', content: SYSTEM }],
      expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }],
      monitor: monitor => monitor.addEventListener('downloadprogress', event => onProgress?.(event.loaded)),
    };
    try { session = await model.create(options); } catch (error) { failed = true; throw error; }
  }
  const run = session.prompt(String(text).slice(0, 220), { responseConstraint: SCHEMA });
  let timer;
  try {
    const raw = await Promise.race([run, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Chrome AI took too long')), timeoutMs); })]);
    return { patch: sanitize(raw), reader: 'Chrome AI' };
  } finally { clearTimeout(timer); }
}

export function closeAI() { try { session?.destroy?.(); } catch { /* ignore */ } session = null; failed = false; }
