// Turns a USC Catalogue program (dist/programs/<id>.json, a snapshot of catalogue.usc.edu) into requirement rows
// the planner understands, using the courses a student has completed or is taking. Pure functions, no network.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

// "MATH 125g" -> MATH-125, "CHEM 105aLg" -> CHEM-105A, "PHYS 151Lg" -> PHYS-151, "EE 202L" -> EE-202, "BME 445bL" -> BME-445B.
// Lab "L" and the lowercase flags (g, w, x, m, p) are dropped so catalogue codes match registrar-style codes.
export function courseKey(text) {
  const match = /^([A-Za-z]{2,5})[\s-]?(\d{3})([A-Da-d]?)([Ll]?)([a-z]*)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}${match[3].toUpperCase()}`;
}

// Display form without the catalogue's lowercase course flags: "MATH 125g" -> "MATH 125", "CHEM 105aLg" -> "CHEM 105AL".
export function displayCode(text) {
  const match = /^([A-Za-z]{2,5})\s*(\d{3})([A-Da-d]?)([Ll]?)([a-z]*)$/.exec(String(text ?? '').trim());
  return match ? `${match[1].toUpperCase()} ${match[2]}${match[3].toUpperCase()}${match[4].toUpperCase()}` : norm(text);
}

// Keys for a loose list of codes ("CHEM 105A", "PHYS-151L", "BME 445AL").
export const keysOf = codes => new Set([...codes].map(code => courseKey(String(code))).filter(Boolean));

const norm = text => String(text ?? '').replace(/\s+/g, ' ').trim();
const unitsOf = value => { const n = Number.parseFloat(String(value)); return Number.isFinite(n) ? n : 0; };

// How many slots of a group must be satisfied? "One course from the following" -> 1; otherwise every slot.
function needed(group, slotCount) {
  const text = [group.rule, group.sub, ...(group.notes ?? [])].join(' ');
  const word = /\b(one|two|three|four|five|six|seven|eight)\s+(?:additional\s+|upper[- ]division\s+|of the following\s+)?(?:courses?|from)/i.exec(text);
  if (word) return Math.min(slotCount, WORDS[word[1].toLowerCase()]);
  const digit = /\b(\d)\s+(?:additional\s+)?courses?\b/i.exec(text);
  if (digit) return Math.min(slotCount, Number(digit[1]));
  return slotCount;
}

// Group consecutive courses joined by "or" into one slot of alternatives.
function slotsOf(courses) {
  const slots = [];
  let open = false;
  for (const course of courses) {
    if (open) slots.at(-1).push(course); else slots.push([course]);
    open = Boolean(course.or);
  }
  return slots;
}

export function deriveRequirements(program, { completed = new Set(), inProgress = new Set(), label = '' } = {}) {
  const rows = [];
  for (const group of program.groups) {
    if (/general education/i.test(group.section) && !group.courses.length) continue; // GE categories come from the audit
    const title = norm([group.section, group.sub].filter(Boolean).join(' · ')) || 'Requirements';
    if (!group.courses.length) {
      const note = norm(group.notes?.[0]);
      if (/^total units/i.test(group.section) || !note) continue;
      rows.push({ title: `${label}${title}`, status: 'remaining', children: [], note, group: title, programRow: true });
      continue;
    }
    const slots = slotsOf(group.courses);
    const need = needed(group, slots.length);
    const state = slot => {
      const keys = slot.map(course => courseKey(course.code));
      if (keys.some(key => completed.has(key))) return 'complete';
      if (keys.some(key => inProgress.has(key))) return 'progress';
      return 'remaining';
    };
    const states = slots.map(state);
    // Satisfied slots count first; when only some slots are required, pick the most advanced ones.
    const rank = { complete: 0, progress: 1, remaining: 2 };
    const ordered = states.map((s, i) => ({ s, i })).sort((a, b) => rank[a.s] - rank[b.s] || a.i - b.i);
    const counted = new Set(ordered.slice(0, need).map(entry => entry.i));
    const done = [...counted].filter(i => states[i] === 'complete').length;
    const prog = [...counted].filter(i => states[i] === 'progress').length;
    const status = done >= need ? 'complete' : done + prog >= need ? 'progress' : 'remaining';
    const remainingUnits = [...counted].filter(i => states[i] === 'remaining').reduce((sum, i) => sum + unitsOf(slots[i][0].units), 0);
    rows.push({
      title: `${label}${title}`, status, group: title, programRow: true, rule: norm(group.rule) || null,
      remaining: remainingUnits || undefined, courseCount: status === 'remaining' ? need - done - prog : undefined,
      children: slots.map((slot, i) => ({
        title: `${slot.map(course => displayCode(course.code)).join(' or ')} · ${slot[0].title}${slot.length > 1 ? ` (or ${slot.slice(1).map(c => c.title).join('; ')})` : ''}`.slice(0, 200),
        status: states[i], optional: !counted.has(i), units: unitsOf(slot[0].units),
      })),
    });
  }
  return rows;
}

export const programLabel = program => `${program.name}${program.kind === 'minor' ? '' : ''}`;
