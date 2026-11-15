// Four-Year Plan board: which terms hold which courses. Pure logic. Past terms come from a fixture or the audit, the
// planning term (Spring 2027) from the student's real plan and registered classes, later terms from what the program
// still requires. Students can move later courses; prerequisite problems are reported, not hidden.
import { catalog, geCategoryOf, fmtUnits } from './logic.js';
import { courseKey, keysOf } from './programs.js';
import { courseName, meets } from './planner.js';

export const PLAN_TERM = 'Spring 2027';
export const NOW_TERM = 'Fall 2026';
const SEQUENCE = [];
for (let year = 2024; year <= 2031; year += 1) SEQUENCE.push(`Fall ${year}`, `Spring ${year + 1}`);
export const termIndex = label => SEQUENCE.indexOf(label);
export const FUTURE_TERMS = SEQUENCE.slice(termIndex(PLAN_TERM) + 1);

const level = code => Number((/\d{3}/.exec(code) ?? ['999'])[0]);
const keyOf = code => courseKey(String(code).replace(/\s+L$/, '')) ?? String(code);

// Known prerequisite rules for courses in the bundled schedule snapshot. Other courses have none in the data.
function rulesFor(key) {
  const course = catalog.get(key);
  return course ? { prereq: course.prereq, coreq: course.coreq } : { prereq: [], coreq: [] };
}

export function buildBoard({ rows = [], past = [], registered = [], planned = [], geChosen = {}, moves = {}, load = 16, remainingUnits = null, titles = new Map() }) {
  const terms = new Map(SEQUENCE.map(label => [label, { label, status: 'later', boxes: [] }]));
  const completedKeys = new Set();
  const placedAt = new Map(); // key -> term label (for prerequisite checks)

  for (const entry of past) {
    const term = terms.get(entry.label);
    if (!term) continue;
    term.status = entry.status === 'now' ? 'now' : 'done';
    for (const box of entry.boxes) {
      const key = keyOf(box.code);
      if (entry.status !== 'now') completedKeys.add(key);
      placedAt.set(key, entry.label);
      term.boxes.push({ id: `${key}@${entry.label}`, key, code: box.code, title: box.title ?? titles.get(key) ?? '', units: box.units, req: box.req ?? '', status: entry.status === 'now' ? 'inprogress' : 'completed', kind: 'course', note: box.note ?? '' });
    }
  }

  const plan = terms.get(PLAN_TERM);
  plan.status = 'plan';
  const plannedKeys = new Set();
  for (const item of registered) {
    const key = keyOf(courseName(item.course.id));
    plannedKeys.add(key); placedAt.set(key, PLAN_TERM);
    plan.boxes.push({ id: `${key}@reg`, key, code: courseName(item.course.id), title: item.course.name === item.course.id ? '' : item.course.name, units: item.course.units, req: 'Registered', status: 'registered', kind: 'course', sections: item.sections });
  }
  for (const item of planned) {
    const key = item.course.id;
    plannedKeys.add(key); placedAt.set(key, PLAN_TERM);
    const category = (item.course.ge ?? []).find(Boolean) ?? null;
    plan.boxes.push({ id: `${key}@plan`, key, code: courseName(item.course.id), title: item.course.name, units: item.course.units, req: item.reqLabel ?? '', status: 'planned', kind: item.src === 'ge' ? 'ge' : 'course', category: item.src === 'ge' ? item.category : null, sections: item.sections, entry: item });
  }

  // Open requirements: GE categories become "Choose a course" slots; program courses fill the later terms.
  const geOpen = rows.filter(row => geCategoryOf(row.title) && row.status === 'remaining').map(row => geCategoryOf(row.title));
  const plannedCats = new Set(planned.filter(item => item.src === 'ge').map(item => item.category));
  const slots = [];
  for (const row of rows) {
    if (row.status === 'complete' || geCategoryOf(row.title)) continue;
    if (row.programRow) {
      for (const child of row.children) {
        if (child.status !== 'remaining' || child.optional) continue;
        const code = child.title.split(' · ')[0].split(' or ')[0];
        const key = keyOf(code);
        if (completedKeys.has(key) || plannedKeys.has(key)) continue;
        slots.push({ key, code, title: child.title.split(' · ').slice(1).join(' · ').replace(/ \(or .*\)$/, ''), units: child.units ?? 4, req: row.group ?? row.title });
      }
    }
  }
  // Without catalogue rows, fall back to the courses the requirement rows name that exist in the schedule snapshot.
  if (!rows.some(row => row.programRow)) {
    for (const row of rows) {
      if (row.status !== 'remaining' || geCategoryOf(row.title)) continue;
      for (const child of row.children ?? []) {
        const key = keyOf(child.title.split(' · ')[0]);
        if (catalog.has(key) && !completedKeys.has(key) && !plannedKeys.has(key)) slots.push({ key, code: courseName(key), title: catalog.get(key).name, units: catalog.get(key).units, req: row.title });
      }
    }
  }
  const seen = new Set();
  const queue = slots.filter(slot => !seen.has(slot.key) && seen.add(slot.key)).sort((a, b) => level(a.code) - level(b.code) || a.code.localeCompare(b.code));

  const geBox = (category, term) => {
    const chosen = geChosen[category];
    return chosen && chosen.term === term
      ? { id: `ge:${category}`, key: `ge:${category}`, code: courseName(chosen.course.id), title: chosen.course.name, units: chosen.course.units, req: category, status: 'planned', kind: 'ge', category, movable: false, chosenLater: true }
      : { id: `ge:${category}`, key: `ge:${category}`, code: category, title: 'Choose a course', units: 4, req: category, status: 'open', kind: 'ge-slot', category, movable: true };
  };
  // GE slots: the first sits in the planning term (where sections exist), the rest in following terms. Moves override.
  const slotTerms = {};
  const firstHome = plannedCats.size ? 0 : 1; // the planning term gets a slot only if no GE is planned there yet
  geOpen.filter(category => !plannedCats.has(category)).forEach((category, i) => { slotTerms[category] = moves[`ge:${category}`] ?? (i === 0 && !plannedCats.size ? PLAN_TERM : FUTURE_TERMS[i - firstHome]); });
  for (const category of Object.keys(geChosen)) if (!plannedCats.has(category) && geChosen[category]) slotTerms[category] = geChosen[category].term;
  for (const [category, term] of Object.entries(slotTerms)) terms.get(term)?.boxes.push(geBox(category, term));

  // Later terms: greedy, prerequisites first, up to the unit limit. Moves are honored first.
  const used = label => terms.get(label).boxes.reduce((sum, box) => sum + box.units, 0);
  const place = (slot, label) => {
    terms.get(label).boxes.push({ id: `${slot.key}@later`, key: slot.key, code: slot.code, title: slot.title, units: slot.units, req: slot.req, status: 'estimate', kind: 'course', movable: true });
    placedAt.set(slot.key, label);
  };
  const free = [];
  for (const slot of queue) { const to = moves[slot.key]; if (to && terms.has(to) && termIndex(to) > termIndex(PLAN_TERM)) place(slot, to); else free.push(slot); }
  const ready = (slot, label) => {
    const { prereq, coreq } = rulesFor(slot.key);
    if (!prereq.length && !coreq.length) return true;
    const before = new Set([...completedKeys, ...[...placedAt].filter(([, at]) => termIndex(at) < termIndex(label)).map(([key]) => key)]);
    const upTo = new Set([...completedKeys, ...[...placedAt].filter(([, at]) => termIndex(at) <= termIndex(label)).map(([key]) => key)]);
    return meets(prereq, before) && meets(coreq, upTo);
  };
  let remaining = free.slice();
  for (const label of FUTURE_TERMS) {
    if (!remaining.length) break;
    // Repeat the pass so a course whose corequisite lands later in the same term is still placed there.
    for (let again = true; again;) {
      again = false;
      for (const slot of [...remaining]) {
        if (used(label) + slot.units > load || !ready(slot, label)) continue;
        place(slot, label); remaining = remaining.filter(other => other !== slot); again = true;
      }
    }
  }
  // Open electives fill any remaining degree units so the last term matches the units-based projection.
  const placedUnits = [...terms.values()].filter(t => termIndex(t.label) >= termIndex(PLAN_TERM)).reduce((sum, t) => sum + t.boxes.reduce((n, b) => n + b.units, 0), 0);
  let leftOver = remainingUnits == null ? 0 : Math.max(0, remainingUnits - placedUnits);
  for (const label of FUTURE_TERMS) {
    while (leftOver > 0 && used(label) < load) {
      const size = Math.min(4, load - used(label), leftOver);
      terms.get(label).boxes.push({ id: `elective@${label}@${used(label)}`, key: `elective:${label}:${used(label)}`, code: 'Open elective', title: 'Fills remaining units', units: size, req: 'Electives', status: 'estimate', kind: 'elective', movable: false });
      leftOver -= size;
    }
  }

  // Prerequisite and corequisite problems for courses whose rules are known.
  const issues = [];
  for (const term of terms.values()) {
    for (const box of term.boxes) {
      if (box.kind !== 'course' || box.status === 'completed') continue;
      const { prereq, coreq } = rulesFor(box.key);
      const before = new Set([...completedKeys, ...[...placedAt].filter(([, at]) => termIndex(at) < termIndex(term.label)).map(([key]) => key)]);
      const upTo = new Set([...before, ...[...placedAt].filter(([, at]) => at === term.label).map(([key]) => key)]);
      const problems = [];
      if (prereq.length && !meets(prereq, before)) problems.push(`Needs ${prereq.map(g => g.options.map(o => o.map(courseName).join(' + ')).join(' or ')).join('; ')} in an earlier term.`);
      if (coreq.length && !meets(coreq, upTo)) problems.push(`Needs ${coreq.map(g => g.options.map(o => o.map(courseName).join(' + ')).join(' or ')).join('; ')} in the same term or earlier.`);
      if (problems.length) { box.issue = problems.join(' '); issues.push({ id: box.id, term: term.label, code: box.code, text: box.issue }); }
    }
  }

  const years = [];
  const lastUsed = Math.max(termIndex(PLAN_TERM), ...[...terms.values()].filter(t => t.boxes.length).map(t => termIndex(t.label)));
  const firstUsed = Math.min(...[...terms.values()].filter(t => t.boxes.length).map(t => termIndex(t.label)));
  const start = firstUsed - (firstUsed % 2);
  const end = lastUsed + (lastUsed % 2 === 0 ? 1 : 0);
  for (let i = start; i <= end; i += 2) {
    const fall = terms.get(SEQUENCE[i]), spring = terms.get(SEQUENCE[i + 1]);
    years.push({ index: years.length, label: `Year ${years.length + 1}`, fall: { ...fall, units: fall.boxes.reduce((n, b) => n + b.units, 0) }, spring: spring ? { ...spring, units: spring.boxes.reduce((n, b) => n + b.units, 0) } : null });
  }
  const lastTerm = SEQUENCE[lastUsed];
  return { years, issues, lastTerm, terms: [...terms.values()], openCount: rows.filter(row => row.status === 'remaining' && !plannedCats.has(geCategoryOf(row.title))).length, fmtUnits };
}

export { keysOf };
