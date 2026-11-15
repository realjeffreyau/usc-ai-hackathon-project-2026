// Pure, DOM-free helpers shared by the UI and the tests. Nothing here touches the network or storage.
import { courses } from './catalog.js';
import { conflictsFor, courseName, interpretGoal, linkedCourses, meets, planSemester, totalUnits } from './planner.js';

export const geCategoryOf = text => {
  const match = /\bGE[-\s]?([A-H])\b/i.exec(String(text ?? ''));
  return match ? `GE-${match[1].toUpperCase()}` : null;
};

export const catalog = new Map(courses.map(course => [course.id, course]));
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEBREG_URL = 'https://webreg.usc.edu/';

export function fmtTime(minutes) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`;
}
export const fmtDays = days => days.map(day => DAYS[day]).join('/');
export const fmtMeeting = meeting => `${fmtDays(meeting.days)} ${fmtTime(meeting.start)} - ${fmtTime(meeting.end)}`;
export const fmtUnits = value => (Number.isInteger(value) ? String(value) : value.toFixed(1));
export const fmtMeetings = section => section.meetings.length ? section.meetings.map(fmtMeeting).join(', ') : 'No meeting time listed';

// Rate My Professors search for USC (school id 1381). Only a public instructor name is placed in the URL.
export const rmpUrl = name => `https://www.ratemyprofessors.com/search/professors/1381?q=${encodeURIComponent(name)}`;

export function seatText(section) {
  if (section.seats == null) return 'Seats not reported (snapshot)';
  if (section.seats === 0) return 'Full in snapshot';
  return `${section.seats} seat${section.seats === 1 ? '' : 's'} open in snapshot`;
}

export function describeRule(groups) {
  return groups.map(({ count, options }) =>
    (count > 1 ? `${count} of: ` : '') + options.map(option => option.map(courseName).join(' + ')).join(' or ')).join('; ');
}

export const itemsOf = plan => plan.map(({ course, index }) => ({ course, index, sections: course.bundles[index] }));

// ---- Degree units ---------------------------------------------------------------------------
export function unitSummary(audit) {
  const read = value => (Number.isFinite(value) ? value : null);
  const total = read(audit.total), earned = read(audit.earned), progress = read(audit.progress);
  let remaining = read(audit.remaining), derived = false;
  const notes = [];
  if (total == null) notes.push('Total degree units were not found in this report.');
  if (earned == null) notes.push('Earned units were not found in this report.');
  if (progress == null) notes.push('In-progress units were not found in this report.');
  if (remaining == null && total != null && earned != null) {
    remaining = Math.max(0, total - earned - (progress ?? 0));
    derived = true;
    notes.push(`Remaining units were not reported, so ${fmtUnits(remaining)} is calculated as total − earned${progress == null ? '' : ' − in progress'}. Confirm it in STARS.`);
  } else if (remaining == null) {
    notes.push('Remaining units were not found in this report.');
  }
  if (!derived && [total, earned, progress, remaining].every(value => value != null)
    && Math.abs(earned + progress + remaining - total) > 0.01) {
    notes.push(`Earned + in progress + remaining is ${fmtUnits(earned + progress + remaining)}, which differs from the ${fmtUnits(total)}-unit total. Check the report.`);
  }
  return { total, earned, progress, remaining, derived, notes };
}

export function requirementCounts(requirements) {
  const counts = { complete: 0, progress: 0, remaining: 0 };
  for (const row of requirements) counts[row.status] += 1;
  return counts;
}

// ---- Goal interpretation -------------------------------------------------------------------
// Wraps the browser-local model. "Under N units" is read strictly (at most N - 1).
export function readGoal(goal = '') {
  const text = String(goal).slice(0, 220);
  const prefs = { ...interpretGoal(text) };
  const strict = text.toLowerCase().match(/\b(?:under|below|less than|fewer than)\s*(\d{1,2})\s*(?:units?|credits?)\b/);
  const mentionsUnits = /\b\d{1,2}\s*(?:units?|credits?)\b/i.test(text) || prefs.units === 12;
  if (strict) {
    prefs.units = Math.max(2, Math.min(20, Number(strict[1]) - 1));
    prefs.understood = true;
  }
  return { prefs, strictLimit: strict ? Number(strict[1]) : null, mentionsUnits, blank: !text.trim() };
}

export function describeGoal({ prefs, strictLimit, mentionsUnits }) {
  const chips = [];
  if (strictLimit) chips.push(`Under ${strictLimit} units (at most ${prefs.units})`);
  else chips.push(`At most ${prefs.units} units${mentionsUnits ? '' : ' (default)'}`);
  if (prefs.morning > 0) chips.push(`No classes before ${fmtTime(prefs.morning)}`);
  if (prefs.latest != null) chips.push(`No classes after ${fmtTime(prefs.latest)}`);
  if (prefs.sequence) chips.push('Prioritize courses that unlock later requirements');
  return chips;
}

// ---- Deterministic validation ---------------------------------------------------------------
function describeMissing(groups, codes) {
  const missing = groups.filter(({ count, options }) => options.filter(option => option.every(code => codes.has(code))).length < count);
  return describeRule(missing);
}

// completed: Set of confirmed course ids. concurrent: ids planned/bin-loaded this term.
export function checkCourse({ course, sections }, completed, concurrent) {
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  if (!course.prereq.length) add('ok', 'No prerequisites listed.');
  else if (meets(course.prereq, completed)) add('ok', `Prerequisite met: ${describeRule(course.prereq)}.`);
  else add('error', `Prerequisite not confirmed: ${describeMissing(course.prereq, completed)}.`);
  if (course.coreq.length) {
    const together = new Set([...completed, ...concurrent]);
    if (meets(course.coreq, together)) add('ok', `Corequisite satisfied: ${describeRule(course.coreq)}.`);
    else add('error', `Corequisite missing: ${describeMissing(course.coreq, together)} must be taken this term or earlier.`);
  }
  const modes = sections.map(section => section.mode.toLowerCase()).join(' + ');
  add('ok', `Complete section bundle: ${modes}.`);
  if (sections.some(section => section.seats === 0)) add('warn', 'A section is full in the snapshot. Check WebReg for a waitlist.');
  if (sections.some(section => section.clearance)) add('warn', 'A section lists department clearance. Check WebReg for permission requirements.');
  if (sections.some(section => !section.meetings.length)) add('warn', 'A section has no meeting time listed.');
  return checks;
}

export function describeConflict([a, b]) {
  const days = a.days.filter(day => b.days.includes(day));
  const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
  return `${courseName(a.course)} (${a.section}) overlaps ${courseName(b.course)} (${b.section}) on ${fmtDays(days)}, ${fmtTime(start)} - ${fmtTime(end)}`;
}

export function listConflicts(items) {
  const seen = new Set();
  return conflictsFor(items).filter(([a, b]) => {
    const key = [a.section, b.section].sort().join('|') + '|' + a.days.join('') + b.days.join('') + a.start + b.start;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function preferenceReport({ prefs }, items) {
  const rows = [];
  const total = totalUnits(items);
  rows.push({ level: total <= prefs.units ? 'met' : 'missed', text: `Unit limit: ${fmtUnits(total)} of ${prefs.units} units planned.` });
  const outside = test => items.flatMap(({ course, sections }) => sections.flatMap(section =>
    section.meetings.filter(test).map(meeting => `${courseName(course.id)} ${fmtMeeting(meeting)}`)));
  if (prefs.morning > 0) {
    const bad = outside(meeting => meeting.start < prefs.morning);
    rows.push(bad.length
      ? { level: 'missed', text: `No classes before ${fmtTime(prefs.morning)}: not met. ${bad.join('; ')}. Times are a preference, not a rule; the planner kept the conflict-free option.` }
      : { level: 'met', text: `No classes before ${fmtTime(prefs.morning)}: met.` });
  }
  if (prefs.latest != null) {
    const bad = outside(meeting => meeting.end > prefs.latest);
    rows.push(bad.length
      ? { level: 'missed', text: `No classes after ${fmtTime(prefs.latest)}: not met. ${bad.join('; ')}. Times are a preference, not a rule; the planner kept the conflict-free option.` }
      : { level: 'met', text: `No classes after ${fmtTime(prefs.latest)}: met.` });
  }
  if (prefs.sequence) {
    const unlockers = items.filter(({ course }) => linkedCourses(course.id).length);
    rows.push(unlockers.length
      ? { level: 'met', text: `Prerequisites prioritized: ${unlockers.map(({ course }) => `${courseName(course.id)} unlocks ${linkedCourses(course.id).map(courseName).join(', ')}`).join('; ')}.` }
      : { level: 'partial', text: 'Prerequisites prioritized: no eligible course in this plan unlocks a later class.' });
  }
  return rows;
}

export function whyLines({ course }, prefsInfo, concurrentIds) {
  const lines = [course.why];
  const unlocks = linkedCourses(course.id);
  if (unlocks.length) lines.push(`Linked to ${unlocks.map(courseName).join(', ')} as a prerequisite or corequisite.${prefsInfo?.prefs.sequence ? ' You asked to prioritize prerequisites.' : ''}`);
  const needed = course.coreq.flatMap(group => group.options.flat()).filter(code => concurrentIds.has(code));
  if (needed.length) lines.push(`Its corequisite ${needed.map(courseName).join(', ')} is in this plan.`);
  return lines;
}

export function leftOutReason(course, completed, plannedIds, binIds, cap) {
  if (binIds.has(course.id)) return 'Already in your myCourseBin check.';
  if (!meets(course.prereq, completed)) return `Prerequisite not confirmed: ${describeMissing(course.prereq, completed)}.`;
  const together = new Set([...completed, ...plannedIds]);
  if (!meets(course.coreq, together)) return `Needs ${describeMissing(course.coreq, together)} in the same term or earlier, and that course is not in this plan.`;
  return `Eligible, but it did not fit alongside higher-priority courses within ${cap} units and without time conflicts.`;
}

// ---- myCourseBin ----------------------------------------------------------------------------
export function bundleStatus(course, sections) {
  const ids = new Set(sections.map(section => section.id));
  const candidates = course.bundles.filter(bundle => [...ids].every(id => bundle.some(section => section.id === id)));
  if (!candidates.length) return { level: 'error', text: 'These sections do not belong to one valid bundle. Choose one lecture with its matching discussion or lab.' };
  const complete = candidates.some(bundle => bundle.every(section => ids.has(section.id)));
  if (complete) return { level: 'ok', text: 'Complete section bundle.' };
  const options = [...new Set(candidates.map(bundle => bundle.filter(section => !ids.has(section.id))
    .map(section => `${section.mode} ${section.id}`).join(' + ')))];
  return { level: 'warn', text: `Missing a required companion section. Add: ${options.join(' or ')}.` };
}

export function binReport(parsed, planItems) {
  const planSections = new Set(planItems.flatMap(({ sections }) => sections.map(section => section.id)));
  const rows = parsed.existing.map(item => ({
    ...item,
    bundle: bundleStatus(item.course, item.sections),
    inPlan: item.sections.filter(section => planSections.has(section.id)).map(section => section.id),
    samePlanCourse: planItems.some(({ course }) => course.id === item.course.id),
  }));
  const overlay = rows.map(row => ({ course: row.course, sections: row.sections.filter(section => !planSections.has(section.id)) }));
  const conflicts = listConflicts([...planItems, ...overlay]);
  const planIds = new Set(planItems.map(({ course }) => course.id));
  const binOnly = rows.filter(row => !planIds.has(row.course.id)).map(row => ({ course: row.course, sections: row.sections }));
  return { rows, conflicts, unknown: parsed.unknown, extraUnits: totalUnits(binOnly) };
}

// ---- Calendar -------------------------------------------------------------------------------
export function calendarEvents(items, kind) {
  return items.flatMap(({ course, sections }) => sections.flatMap(section => section.meetings.flatMap(meeting =>
    meeting.days.map(day => ({ kind, day, start: meeting.start, end: meeting.end, course: course.id, section: section.id, mode: section.mode, conflict: false })))));
}

export function markConflicts(events) {
  events.forEach((a, i) => {
    for (const b of events.slice(i + 1)) {
      if (a.day === b.day && a.section !== b.section && a.start < b.end && b.start < a.end) a.conflict = b.conflict = true;
    }
  });
  return events;
}

// Assign side-by-side columns to overlapping events on one day.
export function layoutColumns(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const ends = [];
    for (const event of cluster) {
      let column = ends.findIndex(end => end <= event.start);
      if (column < 0) { column = ends.length; ends.push(0); }
      ends[column] = event.end;
      event.col = column;
    }
    for (const event of cluster) event.cols = ends.length;
    cluster = [];
  };
  for (const event of sorted) {
    if (cluster.length && event.start >= clusterEnd) flush();
    cluster.push(event);
    clusterEnd = cluster.length === 1 ? event.end : Math.max(clusterEnd, event.end);
  }
  if (cluster.length) flush();
  return sorted;
}

// ---- Requirement-driven planning (used by the WebReg extension) -----------------------------
const CODE_PATTERN = /\b([A-Z]{2,5})[\s-]?(\d{3}[A-Z]?)\b/g;
export const codesIn = text => [...new Set([...String(text).toUpperCase().matchAll(CODE_PATTERN)].map(m => `${m[1]}-${m[2]}`))];

// Catalog courses that a requirement row names. If it names none, a remaining row falls back to the
// courses the audit suggested, and the source says so, so the UI can be honest about it.
export function requirementCourses(requirement, audit) {
  const category = geCategoryOf(requirement.title);
  if (category) return { ids: [], source: 'ge', category };
  const named = [...new Set([requirement.title, ...requirement.children.map(child => child.title)].flatMap(codesIn))].filter(id => catalog.has(id));
  if (named.length) return { ids: named, source: 'named' };
  if (requirement.status === 'remaining') {
    const suggested = audit.suggested.filter(id => catalog.has(id));
    if (suggested.length) return { ids: suggested, source: 'suggested' };
  }
  return { ids: [], source: 'none' };
}

export const courseRequirements = (courseId, audit) => audit.requirements
  .filter(row => requirementCourses(row, audit).source === 'named' && requirementCourses(row, audit).ids.includes(courseId))
  .map(row => row.title);

// Courses worth planning for: those named by remaining requirements, else whatever the audit suggested.
export function planTargets(audit) {
  const named = audit.requirements.filter(row => row.status === 'remaining').flatMap(row => {
    const found = requirementCourses(row, audit);
    return found.source === 'named' ? found.ids : [];
  });
  return new Set(named.length ? named : audit.suggested.filter(id => catalog.has(id)));
}

// Plan around one requirement: its courses (plus corequisites they need) first, then fill the unit limit.
export function planForFocus({ completed, focusIds, targets, prefs, fixed = [] }) {
  const focus = focusIds.filter(id => catalog.has(id) && !completed.has(id));
  const support = new Set(focus.flatMap(id => catalog.get(id).coreq.flatMap(group => group.options.flat()))
    .filter(code => catalog.has(code) && !completed.has(code) && !focus.includes(code)));
  const core = new Set([...focus, ...support]);
  const first = planSemester(completed, core, prefs, fixed);
  const firstFixed = first.map(option => ({ course: option.course, sections: option.sections }));
  // Time preferences are soft for the requirement's own courses (best effort, reported). For optional fill courses
  // they are firm: the engine's `strict` option drops section bundles that break them.
  const fillTargets = new Set([...targets].filter(id => !core.has(id)));
  const rest = planSemester(completed, fillTargets, { ...prefs, strict: true }, [...fixed, ...firstFixed]);
  const breaks = bundle => bundle.some(section => section.meetings.some(m =>
    (prefs.morning > 0 && m.start < prefs.morning) || (prefs.latest != null && m.end > prefs.latest)));
  const excluded = [...fillTargets].filter(id => !completed.has(id) && catalog.has(id) && catalog.get(id).bundles.every(breaks));
  return {
    plan: [
      ...first.map(option => ({ course: option.course, index: option.index, role: focus.includes(option.course.id) ? 'focus' : 'support' })),
      ...rest.map(option => ({ course: option.course, index: option.index, role: 'fill' })),
    ],
    excluded,
  };
}

// Which section bundles of a planned course avoid conflicts with the rest of the plan and fixed classes?
export function swapOptions(items, position, fixed, prefs) {
  const { course } = items[position];
  const others = items.filter((_, i) => i !== position).map(item => ({ course: item.course, sections: item.sections }));
  return course.bundles.map((bundle, index) => {
    const ids = new Set(bundle.map(section => section.id));
    const fixedOthers = fixed.map(item => ({ course: item.course, sections: item.sections.filter(section => !ids.has(section.id)) }));
    const conflicts = listConflicts([...others, ...fixedOthers, { course, sections: bundle }]).filter(pair => pair.some(m => ids.has(m.section)));
    const early = bundle.flatMap(section => section.meetings)
      .filter(m => (prefs.morning > 0 && m.start < prefs.morning) || (prefs.latest != null && m.end > prefs.latest)).length;
    return { index, bundle, conflicts, early, full: bundle.some(section => section.seats === 0), ok: !conflicts.length };
  });
}

export const bestSwap = (options, currentIndex) => options.filter(option => option.index !== currentIndex && option.ok)
  .sort((a, b) => a.early - b.early || Number(a.full) - Number(b.full) || a.index - b.index)[0] ?? null;

export const sectionNumbers = items => [...new Set(items.flatMap(({ sections }) => sections.map(section => section.id)))];

// Estimated graduation term if Spring 2027 is planned as given and later terms run at `load` units.
export function projectGraduation(remaining, plannedUnits, load) {
  if (!Number.isFinite(remaining) || remaining < 0 || !Number.isFinite(load) || load <= 0) return null;
  const rest = Math.max(0, remaining - plannedUnits);
  const extra = rest ? Math.ceil(rest / load) : 0;
  return { term: (extra % 2 ? 'Fall ' : 'Spring ') + (2027 + Math.floor(extra / 2)), extraSemesters: extra, restUnits: rest };
}

// ---- Degree roadmap (four-year timeline) ---------------------------------------------------
// Past terms come from a fixture (the planner never reads a transcript). Spring 2027 shows the plan and myCourseBin.
// Later terms are an estimate: courses that become eligible, then open electives to fill the remaining units.
const nextTerm = ({ season, year }) => (season === 'Fall' ? { season: 'Spring', year: year + 1 } : { season: 'Fall', year });
const termLabel = ({ season, year }) => `${season} ${year}`;
const boxFor = (course, kind) => ({ code: courseName(course.id), units: course.units, note: course.prereq.length ? describeRule(course.prereq) : '', kind });

export function buildRoadmap({ audit, past = [], planned = null, registered = [], bin = [], completed = new Set(), load = 16 }) {
  const terms = past.map(term => ({ label: term.label, status: term.status, boxes: term.boxes.map(box => ({ ...box, kind: term.status === 'now' ? 'now' : 'done' })) }));
  const plannedIds = new Set((planned ?? []).map(item => item.course.id));
  const binIds = new Set(bin.map(item => item.course.id));
  const planBoxes = (planned ?? []).map(item => boxFor(item.course, 'plan'));
  const binBoxes = bin.filter(item => !plannedIds.has(item.course.id)).map(item => ({ code: courseName(item.course.id), units: item.course.units, note: '', kind: 'bin' }));
  const regBoxes = registered.filter(item => !plannedIds.has(item.course.id)).map(item => ({ code: courseName(item.course.id), units: item.course.units, note: '', kind: 'reg' }));
  terms.push({ label: 'Spring 2027', status: 'plan', planned: Boolean(planned), boxes: [...regBoxes, ...planBoxes, ...binBoxes] });

  const units = unitSummary(audit);
  const planUnits = planned ? totalUnits(planned) : 0;
  const regUnits = registered.filter(item => !plannedIds.has(item.course.id)).reduce((n, item) => n + item.course.units, 0);
  let left = units.remaining == null ? 0 : Math.max(0, units.remaining - planUnits - regUnits);
  const targets = planTargets(audit);
  const queue = new Set([...targets].filter(id => !completed.has(id) && !plannedIds.has(id) && !binIds.has(id)));
  for (let grew = true; grew;) { // add courses that these unlock (prerequisite or corequisite chain)
    grew = false;
    for (const course of catalog.values()) {
      if (queue.has(course.id) || completed.has(course.id) || plannedIds.has(course.id) || binIds.has(course.id)) continue;
      const needs = [...course.prereq, ...course.coreq].flatMap(group => group.options.flat());
      if (needs.some(id => queue.has(id) || plannedIds.has(id))) { queue.add(course.id); grew = true; }
    }
  }
  const have = new Set([...completed, ...plannedIds, ...binIds]);
  let term = nextTerm({ season: 'Spring', year: 2027 });
  for (let guard = 0; left > 0 && guard < 8; guard += 1, term = nextTerm(term)) {
    const boxes = [];
    const chosen = new Set();
    let used = 0;
    for (const id of [...queue]) {
      const course = catalog.get(id);
      if (!course || used + course.units > load || course.units > left) continue;
      if (!meets(course.prereq, have) || !meets(course.coreq, new Set([...have, ...chosen]))) continue;
      boxes.push(boxFor(course, 'later'));
      chosen.add(id); queue.delete(id);
      used += course.units; left -= course.units;
    }
    while (used < load && left > 0) {
      const size = Math.min(4, load - used, left);
      boxes.push({ code: 'Open elective', units: size, note: 'Fills remaining units', kind: 'elective' });
      used += size; left -= size;
    }
    for (const id of chosen) have.add(id);
    terms.push({ label: termLabel(term), status: 'later', boxes });
  }

  // Group Fall + Spring pairs into years like the printed four-year plan.
  const groups = [];
  const startsFall = terms[0]?.label.startsWith('Fall');
  let slot = startsFall ? [] : [null];
  const academic = past.length > 0;
  for (const item of terms) {
    slot.push(item);
    if (slot.length === 2) { groups.push(slot); slot = []; }
  }
  if (slot.length) groups.push([slot[0], null]);
  const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  return groups.map((pair, i) => {
    const first = pair.find(Boolean);
    const year = Number(first.label.split(' ')[1]) - (first.label.startsWith('Spring') ? 1 : 0);
    return { label: academic ? `${ordinal[i]} year` : `${year}-${String(year + 1).slice(2)}`, fall: pair[0], spring: pair[1] };
  });
}

// ---- Plan from the sections already saved in the real WebReg myCourseBin -----------------------------------------
// bin: result of readCourseBin(). Registered sections are locked. For every other course the planner chooses one
// section from each type (lecture, lab, quiz, discussion). WebReg checks lecture/lab pairing when you register.
const BUNDLE_LIMIT = 400;
export function poolFromBin(bin) {
  const locked = [], pool = [];
  for (const raw of bin.courses) {
    const course = { id: raw.id, name: raw.name, units: raw.units, prereq: [], coreq: [], why: '', bundles: [] };
    const registered = raw.sections.filter(section => section.isRegistered);
    if (registered.length) { course.bundles = [registered]; locked.push({ course, sections: registered }); continue; }
    const types = [...new Set(raw.sections.map(section => section.mode))];
    types.sort((a, b) => Number(/lecture/i.test(b)) - Number(/lecture/i.test(a)));
    let bundles = [[]];
    for (const type of types) {
      const options = raw.sections.filter(section => section.mode === type);
      bundles = bundles.flatMap(bundle => options.map(option => [...bundle, option])).slice(0, BUNDLE_LIMIT);
    }
    course.bundles = bundles;
    pool.push(course);
  }
  return { pool, locked };
}

const overlap = (a, b) => a.start < b.end && b.start < a.end && a.days.some(day => b.days.includes(day));
const clashes = (meetingsA, meetingsB) => meetingsA.some(a => meetingsB.some(b => overlap(a, b)));
const outsideMinutes = (meetings, prefs) => meetings.reduce((sum, m) => sum + (Math.max(0, (prefs.morning ?? 0) - m.start)
  + Math.max(0, m.end - (prefs.latest ?? 1440))) * m.days.length, 0);

export function planPool({ pool, locked = [], prefs }) {
  const fixed = locked.flatMap(item => item.sections.flatMap(section => section.meetings));
  const cap = prefs.units - totalUnits(locked);
  const lockedHits = meetings => locked.filter(item => item.sections.some(section => clashes(section.meetings, meetings))).map(item => item.course);
  const choices = pool.map(course => {
    const all = course.bundles.map((sections, index) => {
      const meetings = sections.flatMap(section => section.meetings);
      return { course, index, sections, meetings, outside: outsideMinutes(meetings, prefs), closed: sections.some(s => s.seats === 0), hits: lockedHits(meetings),
        internal: sections.some((a, i) => sections.slice(i + 1).some(b => clashes(a.meetings, b.meetings))) };
    });
    const options = all.filter(option => !option.hits.length && !option.internal);
    const clean = options.filter(option => option.outside === 0);
    const firm = clean.length > 0 && (prefs.morning > 0 || prefs.latest != null);
    const blocked = [...new Map(all.flatMap(option => option.hits).map(c => [c.id, c])).values()];
    return { course, options: firm ? clean : options, relaxed: !firm && options.some(option => option.outside > 0), blocked };
  });
  let best = { score: [-1, 0, 0], picks: [] };
  const better = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  let nodes = 0;
  const walk = (i, picks, units, outside, closed) => {
    if (++nodes > 200000) return;
    if (i === choices.length) { if (better([units, outside, closed], best.score)) best = { score: [units, outside, closed], picks: [...picks] }; return; }
    for (const option of choices[i].options) {
      const course = choices[i].course;
      if (units + course.units > cap) continue;
      if (picks.some(pick => clashes(pick.meetings, option.meetings))) continue;
      picks.push(option);
      walk(i + 1, picks, units + course.units, outside + option.outside, closed + Number(option.closed));
      picks.pop();
    }
    walk(i + 1, picks, units, outside, closed);
  };
  walk(0, [], 0, 0, 0);
  const chosenIds = new Set(best.picks.map(pick => pick.course.id));
  return {
    chosen: best.picks.map(({ course, index, sections }) => ({ course, index, sections })),
    skipped: choices.filter(choice => !chosenIds.has(choice.course.id)).map(choice => ({
      course: choice.course,
      reason: choice.options.length ? `Left out to stay within ${prefs.units} units or avoid overlaps.`
        : choice.blocked.length ? `Every saved section combination overlaps ${choice.blocked.map(c => courseName(c.id)).join(', ')}, which you are already registered for.`
          : 'Its saved sections overlap each other, so no combination works.',
    })),
    relaxed: choices.filter(choice => chosenIds.has(choice.course.id) && choice.relaxed).map(choice => choice.course),
    lockedUnits: totalUnits(locked),
  };
}
