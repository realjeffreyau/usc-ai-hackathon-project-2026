// TroyPlan planner UI (drawer inside WebReg, and the full website). Everything lives in this module's memory and a shadow root.
// No network calls, no storage APIs, no logging, no clicks on WebReg. Imported strings render with textContent.
import { parseAudit, readAuditPdf } from './audit.js';
import { courseName, linkedCourses, parseCourseBin, prereqCodes, totalUnits } from './planner.js';
import * as L from './logic.js';
import { aiAvailability, interpretWithAI } from './ai.js';
import { readCourseBin, readCourseList } from './webreg.js';
import { GE_CATEGORIES, findGE, parseGEGoal } from './ge.js';
import { courseKey, deriveRequirements, keysOf } from './programs.js';
import { FUTURE_TERMS, NOW_TERM, PLAN_TERM, buildBoard, termIndex } from './board.js';
import { DEMO_REGISTERED, GE_COURSES, SAMPLE_RATINGS } from './ge-data.js';
import { DEMO_PROFILE, EXAMPLES, GE_EXAMPLE, EXAMPLE_PROMPT, demoBin, demoRating } from './fixtures.js';

const HOST_ID = 'trojan-planner-host';
export const WEBSITE_URL = 'http://127.0.0.1:8080/';
const LOGO_URL = new URL(import.meta.url).pathname.includes('/src/') ? new URL('../icons/icon48.png', import.meta.url).href : new URL('./icon.png', import.meta.url).href;
const STATUS = { complete: ['✓', 'Complete'], progress: ['◐', 'In progress'], remaining: ['○', 'Remaining'], planned: ['+', 'Planned'] };
const UNIT_CHOICES = [8, 10, 12, 14, 15, 16, 17, 18];
const ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  wide: 'M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6',
  narrow: 'M20 9h-5V4M4 15h5v5M15 9l5-5M9 15l-5 5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  find: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  check: 'M5 12l5 5L20 7',
  warn: 'M12 4l9 16H3zM12 10v4M12 17.5v.5',
  out: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};

const NS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (typeof value === 'boolean' || key === 'value') el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const fill = (el, ...kids) => { el.replaceChildren(...kids.flat().filter(kid => kid != null && kid !== false)); return el; };
const ext = (href, text, label) => h('a', { class: 'link', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label }, text);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const shortTitle = title => (title.length > 34 ? title.slice(0, 31) + '...' : title);

// ---- State: memory only -------------------------------------------------------------------
const fresh = () => ({
  view: 'progress', open: false, wide: false, mode: 'demo', planView: 'schedule', compareOpen: false, copyMsg: '', shell: 'drawer',
  baseAudit: null, major: null, minor: null, moves: {}, geChosen: {}, boardSel: null, yearIndex: null,
  ge: { category: null, result: null, term: 'Spring 2027' }, geAdded: [], registered: [], live: { courses: null, note: '' },
  audit: null, isDemo: false, confirmed: new Set(), hints: new Set(), profile: null,
  focus: null, prefs: { units: 16, morning: 0, latest: null, sequence: false }, promptText: '', promptNote: '', strictLimit: null,
  plan: null, excluded: [], bin: null, binText: '', binNote: '',
  copied: false, toast: '', busy: '', reader: '', webreg: null, webregResult: null, importOpen: false, importNote: '', importBusy: false,
});
let state = fresh();
let ui; // DOM references
let toastTimer;
let copyTimer;
let importToken = 0;

// Everything planned this term: the requirement plan plus GE courses the student added, in one list.
const entries = () => [...(state.plan ?? []).map((entry, i) => ({ ...entry, src: 'plan', srcIndex: i })), ...state.geAdded.map((entry, i) => ({ ...entry, src: 'ge', srcIndex: i, role: 'ge' }))];
const items = () => entries().map(entry => ({ course: entry.course, index: entry.index, sections: entry.course.bundles[entry.index], src: entry.src, srcIndex: entry.srcIndex, role: entry.role }));
const hasPlanned = () => state.plan !== null || state.geAdded.length > 0;
const registered = () => state.registered ?? [];
const fixedItems = () => [...registered(), ...binItems()];
function setIndex(position, index) {
  const entry = items()[position];
  if (!entry) return;
  if (entry.src === 'ge') state.geAdded[entry.srcIndex].index = index; else state.plan[entry.srcIndex].index = index;
}
const binItems = () => state.bin?.existing ?? [];
const concurrent = () => new Set([...items(), ...binItems()].map(({ course }) => course.id));
const remainingRows = () => (state.audit?.requirements ?? []).filter(row => row.status === 'remaining' && effectiveStatus(row) === 'remaining');
const demoActive = () => state.mode === 'demo';

function conflictPairs() {
  const planned = items();
  const taken = new Set(planned.flatMap(({ sections }) => sections.map(section => section.id)));
  const overlay = fixedItems().map(item => ({ course: item.course, sections: item.sections.filter(section => !taken.has(section.id)) }));
  return L.listConflicts([...planned, ...overlay]);
}

// First planned course involved in a conflict that has a conflict-free alternative section bundle.
function swapPlan(pair) {
  const planned = items();
  for (const id of [...new Set(pair.map(meeting => meeting.course))]) {
    const position = planned.findIndex(entry => entry.course.id === id);
    if (position < 0) continue;
    const best = L.bestSwap(L.swapOptions(planned, position, fixedItems(), state.prefs), planned[position].index);
    if (best) return { position, best, course: planned[position].course };
  }
  return null;
}

// ---- Actions ------------------------------------------------------------------------------
function say(text) {
  state.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; renderToast(); }, 5000);
  renderToast();
}

function loadAudit(audit, { demo, profile }) {
  const hints = new Set(audit.completed.filter(code => L.catalog.has(code) || prereqCodes.includes(code)));
  state = {
    ...fresh(), open: true, shell: state.shell, view: state.shell === 'page' ? state.view : 'progress', wide: state.wide, mode: demo ? 'demo' : state.mode, audit, isDemo: demo, profile,
    registered: demo ? DEMO_REGISTERED : state.registered,
    confirmed: demo ? new Set(audit.completed) : new Set(), hints: demo ? new Set() : hints, baseAudit: audit,
  };
  render();
}

function loadSample() {
  loadAudit(DEMO_PROFILE.audit, { demo: true, profile: DEMO_PROFILE });
  state.baseAudit = DEMO_PROFILE.audit;
  chooseProgram('major', 32049); // the fictional student is a Biomedical Engineering (BS) major
  say('Sample audit loaded. It is fictional.');
}

function clearAudit() { clearMarks(); state = { ...fresh(), open: true, shell: state.shell, view: state.view, wide: state.wide, mode: state.mode }; render(); }

function replan(message) {
  if (!state.focus) return;
  const { plan, excluded } = L.planForFocus({
    completed: state.confirmed, focusIds: state.focus.ids, targets: L.planTargets(state.audit), prefs: state.prefs, fixed: fixedItems(),
  });
  state.plan = plan.map(({ course, index, role }) => ({ course, index, role }));
  state.excluded = excluded;
  state.copied = false;
  const units = totalUnits(items());
  say(message ?? `Plan updated: ${plural(state.plan.length, 'course')}, ${L.fmtUnits(units)} units.`);
}

function startFocus(row) {
  const all = !row;
  const found = all ? { ids: [...L.planTargets(state.audit)], source: 'named' } : L.requirementCourses(row, state.audit);
  state.focus = { title: all ? 'All remaining requirements' : row.title, ids: found.ids, source: found.source };
  state.planView = 'schedule';
  state.view = 'plan';
  replan(all ? undefined : `Planning for ${shortTitle(row.title)}.`);
  render();
  scrollTop();
  focusKey('focus');
}

function setPrefs(patch, message) {
  state.prefs = { ...state.prefs, ...patch };
  state.promptNote = '';
  if (state.planView === 'ge') runGE();
  else if (state.webreg) planFromBin(); else if (state.focus) replan(message); else say('Preferences saved. Choose a requirement to plan.');
  render();
}

// The prompt box is the main control. Chrome's on-device AI reads the sentence when it is available; otherwise the
// built-in rules do. Either way the planner is deterministic and checks every result. Blank text builds as-is.
async function buildFromPrompt(text) {
  state.promptText = text;
  state.promptNote = '';
  state.reader = '';
  let geCategory = null;
  const clean = text.trim();
  if (clean) {
    let patch = null;
    const aiStatus = await aiAvailability();
    if (aiStatus === 'available' || aiStatus === 'downloadable') {
      state.busy = 'Reading your request with Chrome AI...';
      render();
      try {
        const result = await interpretWithAI(clean, { onProgress: fraction => { state.busy = `Downloading Chrome's on-device AI model: ${Math.round(fraction * 100)}%`; renderBusy(); } });
        if (Object.keys(result.patch).length) { patch = result.patch; state.reader = 'Chrome AI (on this computer)'; }
      } catch { /* fall back to the built-in rules */ }
      state.busy = '';
    }
    const geGoal = parseGEGoal(clean);
    if (!patch) {
      const goal = L.readGoal(clean);
      if (goal.prefs.understood || geGoal.category || geGoal.highlyRated) {
        patch = {};
        if (geGoal.highlyRated) patch.ratingFirst = true;
        if (goal.mentionsUnits || goal.strictLimit) patch.units = Math.max(8, Math.min(18, goal.prefs.units));
        if (goal.prefs.morning > 0) patch.morning = goal.prefs.morning;
        if (goal.prefs.latest != null) patch.latest = goal.prefs.latest;
        if (goal.prefs.sequence) patch.sequence = true;
        state.strictLimit = goal.strictLimit;
        state.reader = 'built-in rules';
      } else {
        state.promptNote = 'No preference matched, so I used your current settings. Try "avoid classes before 10 am" or "stay under 16 units".';
      }
    } else state.strictLimit = null;
    if (patch) {
      geCategory = patch.geCategory ?? geGoal.category;
      delete patch.geCategory;
      state.prefs = { ...state.prefs, ...patch };
    }
  }
  if (geCategory || (state.planView === 'ge' && clean)) {
    if (geCategory) state.ge.category = state.mode === 'live' ? 'GE' : geCategory;
    state.view = 'plan';
    state.planView = 'ge';
    runGE();
    render();
    focusKey('ge-heading');
    return;
  }
  if (state.webreg) { state.view = 'plan'; planFromBin(state.promptNote ? undefined : undefined); focusKey('schedule'); return; }
  if (!state.audit) { state.promptNote = 'Load a degree audit first, or open myCourseBin on WebReg and read it.'; render(); return; }
  if (!state.focus) state.focus = { title: 'All remaining requirements', ids: [...L.planTargets(state.audit)], source: 'named' };
  state.view = 'plan';
  replan(state.promptNote ? undefined : 'Schedule built.');
  render();
  focusKey('schedule');
}


// ---- Programs: choose a major and minor; requirements come from the bundled 2026-2027 USC Catalogue snapshot ----------
let programIndex = null;
const programCache = new Map();
const programUrl = name => {
  if (!/^(?:index|[0-9]{1,6})$/.test(String(name))) throw new Error('Invalid catalogue ID.');
  return new URL(`./programs/${name}.json`, import.meta.url);
};

async function ensurePrograms() {
  if (programIndex || programIndex === false) return;
  try { programIndex = await (await fetch(programUrl('index'))).json(); } catch { programIndex = false; }
  render();
}
async function loadProgramData(id) {
  if (!programCache.has(id)) programCache.set(id, await (await fetch(programUrl(id))).json());
  return programCache.get(id);
}

const doneCodes = () => [...state.confirmed, ...(state.profile?.roadmap ?? []).filter(t => t.status === 'done').flatMap(t => t.boxes.map(b => b.code))];
const nowCodes = () => (state.profile?.roadmap ?? []).filter(t => t.status === 'now').flatMap(t => t.boxes.map(b => b.code));

// Rebuild the requirement rows from the chosen programs. GE category rows stay as the audit gave them.
function applyPrograms() {
  if (!state.baseAudit && !state.audit) state.baseAudit = { requirements: [], completed: [], suggested: [], total: null };
  const base = state.baseAudit ?? state.audit;
  state.baseAudit = base;
  const ge = base.requirements.filter(row => L.geCategoryOf(row.title));
  const context = { completed: keysOf(doneCodes()), inProgress: keysOf(nowCodes()) };
  const rows = [];
  if (state.major) rows.push(...deriveRequirements(state.major, context));
  if (state.minor) rows.push(...deriveRequirements(state.minor, { ...context, label: 'Minor · ' }));
  state.audit = (state.major || state.minor)
    ? { ...base, requirements: [...rows, ...ge], total: base.total ?? state.major?.totalUnits ?? null, suggested: base.suggested }
    : base;
}

async function chooseProgram(kind, id) {
  if (!id) { state[kind] = null; }
  else { try { state[kind] = await loadProgramData(id); } catch { say('That program could not be loaded.'); return; } }
  state.moves = {};
  applyPrograms();
  say(id ? `${state[kind].name} requirements loaded from the ${state[kind].catalog} catalogue.` : `${kind === 'major' ? 'Major' : 'Minor'} cleared.`);
  render();
}

function programField(kind, label) {
  const list = (programIndex?.programs ?? []).filter(p => p.kind === kind);
  const current = state[kind];
  const listId = `tp-list-${kind}`;
  return h('div', { class: 'field' },
    h('label', { for: `tp-${kind}` }, label),
    h('div', { class: 'row nowrap' },
      h('input', { id: `tp-${kind}`, type: 'text', list: listId, autocomplete: 'off', spellcheck: 'false', value: current?.name ?? '', placeholder: kind === 'major' ? 'Start typing a major' : 'Optional: a minor', 'data-fk': `prog-${kind}`,
        onchange: event => { const hit = list.find(p => p.name.toLowerCase() === event.target.value.trim().toLowerCase()); if (hit) chooseProgram(kind, hit.id); else if (!event.target.value.trim()) chooseProgram(kind, null); else say('Pick a name from the list.'); } }),
      current ? h('button', { class: 'btn light sm', type: 'button', 'aria-label': `Clear ${label.toLowerCase()}`, onclick: () => chooseProgram(kind, null) }, 'Clear') : null),
    h('datalist', { id: listId }, list.map(p => h('option', { value: p.name }))));
}

function programCard() {
  ensurePrograms();
  const label = [state.major?.name, state.minor ? `${state.minor.name}` : null].filter(Boolean).join(' + ');
  return h('details', { class: 'card more programs', open: state.shell === 'page' && !state.major },
    h('summary', {}, label ? `Program: ${label}` : 'Choose your major and minor'),
    programIndex === false ? h('p', { class: 'status-err' }, 'The program list could not be loaded.') : null,
    programField('major', 'Major'), programField('minor', 'Minor'),
    h('p', { class: 'small muted' }, 'Requirements come from the ', ext(programIndex?.source ?? 'https://catalogue.usc.edu/', `${programIndex?.catalog ?? '2026-2027'} USC Catalogue`, 'USC Catalogue (opens a new tab)'), ' snapshot bundled with TroyPlan. Statuses use the courses you have completed or are taking.'));
}

// ---- GE Finder ----------------------------------------------------------------------------
// All checks are plain code (see ge.js). Demo uses the bundled fictional GE catalog; Live uses sections read from the page.
const LIVE_NOTE = 'WebReg marks GE courses with a "g" but does not show the category (A to H). Confirm the category in your STARS audit.';

function geSource() {
  return state.mode === 'live'
    ? { courses: state.live.courses ?? [], ratings: {}, source: 'Live', ratingLabel: 'Rating', unrated: 'Ratings are not loaded in Live mode. Use the Rate My Professors link.' }
    : { courses: GE_COURSES, ratings: SAMPLE_RATINGS, source: 'Sample', ratingLabel: 'Sample rating' };
}

// The student's week, without the GE already chosen for this category (so the finder can offer replacements).
function geSchedule() {
  const category = state.ge.category;
  return [...registered(), ...items().filter(entry => !(entry.src === 'ge' && state.geAdded[entry.srcIndex].category === category))];
}

function runGE() {
  if (!state.ge.category) { state.ge.result = null; return; }
  const source = geSource();
  state.ge.result = findGE({
    category: state.ge.category, courses: source.courses, ratings: source.ratings, schedule: geSchedule(), prefs: state.prefs,
    completed: state.confirmed, source: source.source, ratingLabel: source.ratingLabel, unratedNote: source.unrated,
  });
}

function startGE(category, term = PLAN_TERM) {
  state.view = 'plan';
  state.planView = 'ge';
  state.ge.term = term;
  state.ge.category = state.mode === 'live' ? 'GE' : category;
  runGE();
  say(state.mode === 'live' ? 'Live GE Finder. Read a WebReg course list to see GE-flagged classes.' : `GE Finder: ${category} ${GE_CATEGORIES[category] ?? ''}.`);
  render();
  scrollTop();
  focusKey('ge-heading');
}

const plannedGE = category => state.geAdded.find(entry => entry.category === category);

function addGE(result) {
  const category = state.ge.category;
  const replaced = plannedGE(category);
  state.geAdded = state.geAdded.filter(entry => entry.category !== category);
  state.geAdded.push({ category, course: result.course, index: result.index });
  delete state.geChosen[category]; delete state.moves[`ge:${category}`];
  state.copied = false;
  runGE();
  const total = totalUnits(items()) + totalUnits(registered());
  say(`${courseName(result.course.id)} added. ${category === 'GE' ? 'GE' : category} is Planned. ${L.fmtUnits(total)} of ${state.prefs.units} units.${replaced ? ` Replaced ${courseName(replaced.course.id)}.` : ''}`);
  state.planView = 'schedule';
  render();
  focusKey(`card-${safeKey(result.course.id)}`);
}

function removeGE(category) {
  state.geAdded = state.geAdded.filter(entry => entry.category !== category);
  state.copied = false;
  runGE();
  say(`${category} removed from your plan.`);
  render();
}

function setGECategory(category) {
  state.ge.category = category;
  runGE();
  render();
}

// ---- Demo / Live data switch -----------------------------------------------------------------
// Demo: fictional audit, registered classes, myCourseBin, GE catalog and ratings. Live: this WebReg page only.

function setMode(mode, { quiet = false } = {}) {
  if (state.mode === mode) return;
  clearMarks();
  state = { ...fresh(), open: true, shell: state.shell, wide: state.wide, view: state.view, mode };
  if (mode === 'demo') {
    loadAudit(DEMO_PROFILE.audit, { demo: true, profile: DEMO_PROFILE });
    if (!quiet) say('Demo data is on. Everything here is fictional.');
    return;
  }
  render();
  if (!quiet) say('Live data is on. The planner uses this WebReg page. Ratings are not loaded.');
}

// Live: read the GE-flagged classes listed on the current WebReg page (department course lists use the same markup).
function readLiveGE() {
  const list = readCourseList(document);
  if (!list.found) { state.live.note = 'No classes found on this page. Open a WebReg department course list, such as History, then try again.'; render(); return; }
  const flagged = list.courses.filter(course => course.geFlag);
  const built = L.poolFromBin({ courses: flagged });
  state.live.courses = built.pool.map(course => ({ ...course, ge: ['GE'], prereq: [], coreq: [], verify: 'Prerequisites and clearance were not read from this list. Check the course in WebReg before adding.' }));
  state.live.note = `${plural(flagged.length, 'GE-flagged class', 'GE-flagged classes')} of ${list.courses.length} on this page. ${LIVE_NOTE}`;
  state.ge.category = 'GE';
  state.planView = 'ge';
  runGE();
  say(flagged.length ? `Read ${plural(flagged.length, 'GE-flagged class', 'GE-flagged classes')}.` : 'No GE-flagged classes on this page.');
  render();
}

// ---- Real WebReg: read myCourseBin from this page and plan from the sections saved there -----------------------
const onCourseBin = () => Boolean(document.getElementById('mycbdiv'));
const onWebReg = () => location.hostname === 'webreg.usc.edu';
let marked = [];

function clearMarks() {
  for (const el of marked) { el.style.outline = ''; el.style.outlineOffset = ''; el.removeAttribute('data-trojan-planner'); }
  marked = [];
}

// Presentation only: outline the recommended rows on the page. Nothing is clicked, submitted, or changed.
function markOnPage(planned) {
  clearMarks();
  for (const { sections } of planned) {
    for (const section of sections) {
      const row = document.getElementById(`section_${section.id}`);
      if (!row) continue;
      row.style.outline = '3px solid #8f1d2c';
      row.style.outlineOffset = '2px';
      row.setAttribute('data-trojan-planner', 'recommended');
      marked.push(row);
    }
  }
}

function readFromPage() {
  const bin = readCourseBin(document);
  if (!bin.found) { say('No classes found. Open myCourseBin and add a class first.'); return; }
  const built = L.poolFromBin(bin);
  state.webreg = { bin, ...built };
  state.bin = null;
  state.registered = built.locked;
  state.view = 'plan';
  planFromBin(`Read ${plural(bin.courses.length, 'class', 'classes')} from myCourseBin.`);
}

function planFromBin(message) {
  const result = L.planPool({ pool: state.webreg.pool, locked: state.webreg.locked, prefs: state.prefs });
  state.webregResult = result;
  state.plan = result.chosen.map(({ course, index }) => ({ course, index, role: 'fill' }));
  state.copied = false;
  markOnPage(items());
  say(message ?? `Schedule built: ${plural(result.chosen.length, 'course')} recommended.`);
  render();
}

function showOnPage(id) {
  const row = document.getElementById(`section_${id}`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const prettyName = name => String(name).split(';').map(part => (part.includes(',') ? part.split(',').reverse().map(x => x.trim()).join(' ') : part.trim())).join(', ');

function loadBin(bin, message) {
  state.bin = bin;
  state.copied = false;
  state.compareOpen = false;
  state.view = 'plan';
  if (state.planView === 'ge') state.planView = 'schedule';
  const pairs = conflictPairs();
  say(message ?? (pairs.length ? `Loaded your myCourseBin. ${plural(pairs.length, 'conflict')} found.` : 'Loaded your myCourseBin. No conflicts.'));
  render();
}

function loadSampleBin() { loadBin(demoBin()); }

function pasteBin(text) {
  try {
    const clean = text.trim();
    if (!clean) throw new Error('Paste one or more five-digit section numbers.');
    const parsed = parseCourseBin(clean);
    state.binNote = '';
    loadBin(parsed, `Checked ${plural(parsed.existing.reduce((n, item) => n + item.sections.length, 0), 'known section')}${parsed.unknown.length ? `, ${parsed.unknown.length} outside the snapshot` : ''}.`);
  } catch (error) {
    state.binNote = error.message;
    render();
  }
}

function clearBin() { state.bin = null; state.binText = ''; state.binNote = ''; state.copied = false; say('myCourseBin cleared.'); render(); }

function swap(pair) {
  const found = swapPlan(pair);
  if (!found) { say('No conflict-free alternative for this course. Change preferences or pick another section option.'); return; }
  setIndex(found.position, found.best.index);
  state.copied = false;
  const left = conflictPairs().length;
  const ids = found.best.bundle.map(section => section.id).join(' + ');
  const teacher = found.best.bundle[0].instructors?.[0];
  say(`${courseName(found.course.id)} moved to ${ids}${teacher ? ` (${prettyName(teacher)})` : ''}. ${left ? plural(left, 'conflict') + ' left.' : 'No conflicts.'}`);
  render();
  focusKey(`card-${safeKey(found.course.id)}`);
}

async function copySections() {
  const ids = L.sectionNumbers(items());
  if (!ids.length) { say('No sections to copy yet.'); return; }
  const text = ids.join(' ');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall back below */ }
  if (!ok) {
    const box = h('textarea', { class: 'sr', 'aria-hidden': 'true', tabindex: '-1' });
    box.value = text;
    ui.root.append(box);
    box.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    box.remove();
  }
  state.copied = ok;
  clearTimeout(copyTimer);
  state.copyMsg = ok ? `Copied ${plural(ids.length, 'section number')}: ${text}` : 'Copy was blocked. Select the numbers and copy them yourself.';
  copyTimer = setTimeout(() => { state.copyMsg = ''; render(); }, 6000);
  render();
}

async function importPdf(file) {
  const token = ++importToken;
  state.importBusy = true; state.importNote = 'Reading the report in this tab...'; render();
  try {
    const audit = await readAuditPdf(file);
    if (token === importToken) { loadAudit(audit, { demo: false, profile: { name: 'Imported audit', detail: 'Read in this tab. Nothing is saved or uploaded.' } }); }
  } catch (error) {
    if (token === importToken) { state.importBusy = false; state.importNote = error?.message || 'This report could not be read.'; render(); }
  }
}

function importText(text) {
  try {
    if (!text.trim()) throw new Error('Paste the text from your STARS report first.');
    loadAudit(parseAudit(text), { demo: false, profile: { name: 'Imported audit', detail: 'Read in this tab. Nothing is saved or uploaded.' } });
  } catch (error) { state.importNote = error.message; render(); }
}

// ---- Focus and scroll helpers -------------------------------------------------------------
const rootQuery = selector => { try { return ui.root.querySelector(selector); } catch { return null; } };
const safeKey = text => String(text).replace(/[^\w-]/g, '_');
function focusKey(key) { queueMicrotask(() => rootQuery(`[data-fk="${key}"]`)?.focus({ preventScroll: false })); }
function scrollTop() { ui.body.scrollTo({ top: 0 }); }
function withFocus(fn) {
  const key = ui.root.activeElement?.getAttribute?.('data-fk');
  fn();
  if (key) rootQuery(`[data-fk="${key}"]`)?.focus({ preventScroll: true });
}

// ---- Next action --------------------------------------------------------------------------
function nextAction() {
  if (state.webreg && state.planView !== 'ge') {
    if (!state.webregResult) return { step: 2, hint: 'Uses the sections saved in your myCourseBin.', label: 'Build schedule', run: () => buildFromPrompt(state.promptText) };
    return { step: 5, hint: state.copied ? 'Copied. Click Schedule on the outlined rows in WebReg yourself.' : 'Recommended rows are outlined in red on the page. You click Schedule yourself.', label: state.copied ? 'Copy section numbers again' : 'Copy section numbers', run: copySections };
  }
  if (onCourseBin() && !state.audit) return { step: 1, hint: 'Reads the classes saved on this page. Nothing is clicked or changed.', label: 'Read my myCourseBin', run: readFromPage };
  if (!state.audit) return { step: 1, hint: 'Start here. The sample is a fictional student.', label: 'Try sample audit', run: loadSample };
  const top = state.planView === 'ge' ? state.ge.result?.viable[0] : null;
  if (top && !plannedGE(state.ge.category)) return { step: 2, hint: 'The best match for your schedule and ratings.', label: `Add ${courseName(top.course.id)} to plan`, run: () => addGE(top) };
  if (!hasPlanned()) {
    const ge = remainingGERows()[0];
    if (ge) return { step: 2, hint: 'Find a GE that fits your week and has a highly rated instructor.', label: `Find courses for ${shortTitle(ge.title)}`, run: () => startGE(L.geCategoryOf(ge.title)) };
    const first = remainingRows().find(row => L.requirementCourses(row, state.audit).ids.length);
    return first
      ? { step: 2, hint: 'Pick the requirement you want to finish first.', label: `Find courses for ${shortTitle(first.title)}`, run: () => startFocus(first) }
      : { step: 2, hint: 'Plan from everything still open.', label: 'Plan all remaining requirements', run: () => startFocus(null) };
  }
  if (!state.bin) return { step: 3, hint: 'Compare the plan with the classes already in WebReg.', label: 'Load sample myCourseBin', run: loadSampleBin };
  const pairs = conflictPairs();
  if (pairs.length) {
    const found = swapPlan(pairs[0]);
    return { step: 4, hint: found ? `Moves ${courseName(found.course.id)} to a section that fits.` : 'No automatic fix. Change a section option or preferences.',
      label: `Swap section (${plural(pairs.length, 'conflict')})`, run: () => swap(pairs[0]), disabled: !found };
  }
  return { step: 5, hint: state.copied ? 'Copied. Return to WebReg and add these sections yourself.' : 'Then add them in WebReg yourself. This panel never registers for you.',
    label: state.copied ? 'Copy section numbers again' : 'Copy section numbers', run: copySections };
}

// ---- Views --------------------------------------------------------------------------------
function statCard(label, value, note) {
  const missing = value == null;
  return h('div', { class: 'stat' + (missing ? ' missing' : '') }, h('strong', {}, missing ? 'Not found' : L.fmtUnits(value)), h('span', {}, label), note ? h('span', {}, note) : null);
}

function importForm() {
  return h('div', { class: 'card' },
    h('h3', {}, 'Import a STARS report'),
    h('p', { class: 'muted small' }, 'A text-based PDF (5 MB max) or pasted report text. It is read in this tab and cleared when you reload. The planner never asks for your USC login or student ID.'),
    h('label', { class: 'dropzone', for: 'tp-file' }, h('b', {}, 'Choose a PDF'), h('span', { class: 'small muted' }, 'Text-based STARS PDF')),
    h('input', { id: 'tp-file', class: 'sr', type: 'file', accept: '.pdf,application/pdf', 'data-fk': 'file', onchange: event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importPdf(file); } }),
    h('label', { class: 'field', for: 'tp-paste' }, h('span', {}, 'Or paste report text'), h('textarea', { id: 'tp-paste', rows: '3', maxlength: '400000', autocomplete: 'off', spellcheck: 'false', 'data-fk': 'paste' })),
    h('button', { class: 'btn light', type: 'button', onclick: () => importText(rootQuery('#tp-paste').value) }, 'Read pasted text'),
    state.importNote ? h('p', { class: state.importBusy ? 'muted' : 'status-err', role: 'status' }, state.importNote) : null);
}

function renderProgress() {
  const view = ui.progress;
  if (!state.audit) {
    fill(view,
      h('section', { class: 'card empty' },
        h('h3', {}, 'See what is left, then plan what is next'),
        h('p', { class: 'lead' }, 'Open a degree audit to see your units and unmet requirements. The sample is a fictional student.'),
        h('button', { class: 'btn primary', type: 'button', 'data-fk': 'sample', onclick: loadSample }, 'Try sample audit'),
        h('button', { class: 'btn light sm', type: 'button', 'aria-expanded': String(state.importOpen), onclick: () => { state.importOpen = !state.importOpen; render(); } }, state.importOpen ? 'Hide import' : 'Import STARS report instead')),
      state.importOpen ? importForm() : null);
    return;
  }
  const units = L.unitSummary(state.audit);
  // Same basis as the Review summary: Spring 2027 is planned (or assumed full), later terms use the unit limit.
  const grad = units.remaining == null ? null : L.projectGraduation(units.remaining, state.plan ? totalUnits(items()) : Math.min(units.remaining, state.prefs.units), state.prefs.units);
  const bar = h('div', { class: 'bar', role: 'img', 'aria-label': 'Earned, in progress, and remaining units as shares of the degree total' });
  if (units.total) {
    for (const [cls, value] of [['earned', units.earned], ['inprog', units.progress], ['left', units.remaining]]) {
      const seg = h('span', { class: `seg ${cls}` });
      seg.style.width = `${Math.max(0, Math.min(100, ((value ?? 0) / units.total) * 100))}%`;
      bar.append(seg);
    }
  }
  const hintsLeft = [...state.hints].filter(code => !state.confirmed.has(code));
  const rows = state.audit.requirements;
  const open = rows.filter(row => effectiveStatus(row) === 'remaining').sort((a, b) => Number(Boolean(L.geCategoryOf(b.title))) - Number(Boolean(L.geCategoryOf(a.title))));
  const rest = [['planned', 'Planned this term'], ['progress', 'In progress'], ['complete', 'Complete']].map(([status, title]) => [title, rows.filter(row => effectiveStatus(row) === status)]).filter(([, list]) => list.length);
  fill(view,
    programCard(),
    h('div', { class: 'between who' },
      h('p', {}, h('b', {}, state.profile?.name ?? 'Degree audit'), h('span', { class: 'muted' }, ' ' + (state.profile?.detail ?? ''))),
      h('button', { class: 'btn light sm', type: 'button', onclick: clearAudit }, 'Switch')),
    hintsLeft.length ? h('section', { class: 'card pending', 'aria-label': 'Confirm credit' },
      h('p', {}, `${plural(hintsLeft.length, 'completed course')} read from your audit: ${hintsLeft.slice(0, 10).map(courseName).join(', ')}${hintsLeft.length > 10 ? '...' : ''}. They are not used for prerequisites until you confirm them.`),
      h('button', { class: 'btn primary sm', type: 'button', 'data-fk': 'confirm', onclick: () => { for (const code of hintsLeft) state.confirmed.add(code); say('Credit confirmed.'); render(); } }, 'Confirm audit credits')) : null,
    h('section', { class: 'card', 'aria-label': 'Degree units' },
      h('div', { class: 'stats' }, statCard('Total', units.total), statCard('Earned', units.earned), statCard('In progress', units.progress), statCard('Remaining', units.remaining, units.derived ? 'Calculated' : null)),
      units.total ? bar : null,
      grad && units.remaining ? h('p', { class: 'small muted' }, `Estimated graduation: `, h('b', {}, grad.term), `. A units-based guess at ${state.prefs.units} units per term.`) : null,
      units.notes.length ? h('ul', { class: 'notes' }, units.notes.map(note => h('li', {}, note))) : null),
    h('section', { class: 'card', 'aria-labelledby': 'tp-req-h' },
      h('h3', { id: 'tp-req-h' }, `What is left (${open.length})`),
      open.length ? h('div', {}, open.map(row => requirementRow(row))) : h('p', { class: 'muted' }, 'No remaining requirements were found in this report.'),
      rest.map(([title, list]) => h('details', { class: 'more', open: title === 'Planned this term' }, h('summary', {}, `${title} (${list.length})`), h('div', {}, list.map(row => requirementRow(row)))))),
    fourYearLink());
}

const effectiveStatus = row => {
  const category = L.geCategoryOf(row.title);
  return category && row.status === 'remaining' && plannedGE(category) ? 'planned' : row.status;
};

function kidList(row) {
  return h('ul', { class: 'kids' }, row.children.map(child => h('li', {}, h('span', {}, child.title), h('span', { class: `pill ${child.status}` }, STATUS[child.status][1]), child.optional && child.status === 'remaining' ? h('em', { class: 'small muted' }, 'one of these is enough') : null)));
}

function fourYearLink() {
  const href = `${WEBSITE_URL}#four-year`;
  return h('section', { class: 'card tight fylink' }, h('div', { class: 'between' },
    h('div', {}, h('h3', {}, 'Four-Year Plan'), h('p', { class: 'small muted' }, 'See every term, move courses and check prerequisites.')),
    state.shell === 'page' ? h('button', { class: 'btn primary sm', type: 'button', onclick: () => setView('four') }, 'Open')
      : h('a', { class: 'btn primary sm', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open the Four-Year Plan on the TroyPlan website (opens a new tab)' }, 'Open', icon('out'))));
}

function requirementRow(row) {
  const found = L.requirementCourses(row, state.audit);
  const status = effectiveStatus(row);
  const kids = row.children.length > 3 || row.programRow;
  const [glyph, label] = STATUS[status];
  const planned = found.category ? plannedGE(found.category) : null;
  const detail = [row.earned != null && `Earned ${L.fmtUnits(row.earned)}`, row.progress != null && `In progress ${L.fmtUnits(row.progress)}`, row.remaining != null && `Needs ${L.fmtUnits(row.remaining)} units`].filter(Boolean).join(', ');
  return h('div', { class: 'req' },
    h('div', { class: 'req-top' }, h('b', {}, row.title), h('span', { class: `pill ${status}` }, h('span', { 'aria-hidden': 'true' }, glyph), ' ' + label)),
    planned ? h('p', { class: 'small' }, `Planned: ${courseName(planned.course.id)} ${planned.course.name}, ${L.fmtUnits(planned.course.units)} units.`) : null,
    detail ? h('p', { class: 'muted small' }, detail) : null,
    row.note ? h('p', { class: 'small muted' }, row.note) : null,
    row.children.length ? (kids ? h('details', { class: 'more' }, h('summary', {}, `Courses (${row.children.length})`), kidList(row)) : kidList(row)) : null,
    row.status === 'remaining' && found.source === 'ge' ? h('div', { class: 'row' },
      h('button', { class: 'btn primary sm', type: 'button', 'data-fk': `find-${safeKey(row.title)}`, 'aria-label': `Find courses for ${row.title}`, onclick: () => startGE(found.category) }, icon('find'), planned ? 'Change GE' : 'Find courses'),
      h('span', { class: 'muted small' }, state.mode === 'demo' ? `${plural(GE_COURSES.filter(c => c.ge.includes(found.category)).length, 'sample course')} to compare` : 'Reads GE-flagged classes on this page'))
    : row.status === 'remaining' ? h('div', { class: 'row' },
      found.ids.length
        ? h('button', { class: 'btn primary sm', type: 'button', 'data-fk': `find-${safeKey(row.title)}`, 'aria-label': `Find courses for ${row.title}`, onclick: () => startFocus(row) }, icon('find'), 'Find courses')
        : h('span', { class: 'muted small' }, 'No matching sections in the bundled schedule.'),
      found.ids.length ? h('span', { class: 'muted small' }, found.source === 'named' ? `${plural(found.ids.length, 'course')}: ${found.ids.map(courseName).join(', ')}` : 'Courses suggested by the report') : null) : null);
}

const ROAD_STATUS = { done: 'Done', now: 'In progress', plan: 'Planning now', later: 'Estimate' };
const ROAD_GLYPH = { done: '✓', now: '◐', plan: '+', bin: '◇', reg: '●', later: '', elective: '' };
const ROAD_WORD = { done: 'Completed', now: 'In progress', plan: 'Planned', bin: 'Already in myCourseBin', reg: 'Registered', later: 'Estimated for later', elective: 'Open elective' };

function roadBox(box) {
  return h('li', { class: `rbox ${box.kind}` },
    h('span', { class: 'sr' }, ROAD_WORD[box.kind] + ': '),
    h('b', {}, (ROAD_GLYPH[box.kind] ? ROAD_GLYPH[box.kind] + ' ' : '') + box.code),
    box.note ? h('i', {}, box.note) : null,
    h('span', { class: 'u' }, `${L.fmtUnits(box.units)}`, h('span', { class: 'sr' }, ' units')));
}

function roadTerm(term, slot) {
  if (!term) return h('div', { class: 'rterm blank', 'aria-hidden': 'true' });
  const isPlan = term.status === 'plan';
  return h('section', { class: `rterm ${term.status}`, 'aria-label': `${term.label}, ${ROAD_STATUS[term.status]}` },
    h('h5', {}, h('span', {}, slot), isPlan ? h('span', { class: 'tag focus' }, ROAD_STATUS.plan) : h('span', { class: 'tag' }, ROAD_STATUS[term.status])),
    h('ul', { class: 'rboxes' },
      term.boxes.map(roadBox),
      isPlan && !term.planned && !term.boxes.length ? h('li', { class: 'rbox empty' }, h('b', {}, 'Not planned yet')) : null),
    isPlan ? h('button', { class: 'btn primary sm', type: 'button', 'data-fk': 'road-plan', onclick: () => { if (hasPlanned()) { state.view = 'plan'; render(); scrollTop(); } else { const next = nextAction(); next.run(); } } }, hasPlanned() ? 'Edit this plan' : 'Plan this term') : null);
}

function roadmapCard() {
  const groups = L.buildRoadmap({ audit: state.audit, past: state.profile?.roadmap ?? [], planned: hasPlanned() ? items() : null, registered: registered(), bin: binItems(), completed: state.confirmed, load: state.prefs.units });
  const key = [['done', 'Done'], ['now', 'In progress'], ['plan', 'Planned'], ['reg', 'Registered'], ['bin', 'In myCourseBin'], ['later', 'Estimate'], ['elective', 'Open elective']];
  return h('section', { class: 'card', 'aria-labelledby': 'tp-road-h' },
    h('h3', { id: 'tp-road-h' }, 'Degree roadmap'),
    h('p', { class: 'muted small' }, state.profile?.roadmap ? 'Earlier terms are fictional. Spring 2027 shows your plan. Later terms are an estimate from your remaining units.' : 'Spring 2027 shows your plan. Later terms are an estimate from your remaining units. Earlier terms are not read from your transcript.'),
    h('ul', { class: 'rkey' }, key.map(([kind, label]) => h('li', {}, h('i', { class: `rsw ${kind}` }), label))),
    h('div', { class: 'roadmap' }, groups.map(group => h('div', { class: 'ryear' },
      h('h4', {}, group.label),
      h('div', { class: 'rterms' }, roadTerm(group.fall, 'Fall'), roadTerm(group.spring, 'Spring'))))));
}

function planEmpty(message, action) {
  return h('section', { class: 'card empty' }, h('h3', {}, 'Plan Semester'), h('p', { class: 'lead' }, message), action);
}

function planSubnav() {
  const tab = (id, label) => h('button', { class: 'subtab', type: 'button', role: 'tab', 'aria-selected': String(state.planView === id || (id === 'schedule' && state.planView === 'ask')), 'data-fk': `sub-${id}`,
    onclick: () => {
      state.planView = id;
      if (id === 'ge' && !state.ge.category) state.ge.category = state.mode === 'live' ? 'GE' : (L.geCategoryOf(remainingGERows()[0]?.title ?? '') ?? 'GE-B');
      if (id === 'ge') runGE();
      render();
    } }, label);
  return h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Plan Semester views' }, tab('schedule', 'Schedule'), tab('ge', 'GE Finder'));
}

const remainingGERows = () => (state.audit?.requirements ?? []).filter(row => L.geCategoryOf(row.title) && effectiveStatus(row) === 'remaining');



function renderPlan() {
  const view = ui.plan;
  const nav = planSubnav();
  if (state.planView === 'ge') { fill(view, nav, askCard(), ...geView()); return; }
  if (!state.audit && !state.webreg) {
    fill(view, nav,
      onCourseBin() ? h('section', { class: 'card', 'aria-labelledby': 'tp-live-h' }, h('h3', { id: 'tp-live-h' }, 'Plan from your myCourseBin'), h('p', { class: 'muted' }, 'Read the classes saved on this page, then say what you want. Nothing is clicked or changed.'), h('button', { class: 'btn primary', type: 'button', 'data-fk': 'read-bin', onclick: readFromPage }, 'Read my myCourseBin'))
        : onWebReg() ? h('section', { class: 'card', 'aria-labelledby': 'tp-live-h' }, h('h3', { id: 'tp-live-h' }, 'Plan from your real classes'), h('p', { class: 'muted' }, 'Open your myCourseBin in WebReg and TroyPlan can read the classes saved there.'), h('a', { class: 'btn light', href: '/CourseBin' }, 'Open myCourseBin')) : null,
      planEmpty('Or try the sample student to see the full flow.', h('button', { class: 'btn light', type: 'button', onclick: loadSample }, 'Try sample audit')));
    return;
  }
  if (state.webreg) { renderWebregPlan(nav); return; }
  fill(view, nav, state.planView === 'ask' ? askCard() : null, ...scheduleView());
}

// ---- Plan Semester: schedule list -----------------------------------------------------------------------------
const TERM = 'Spring 2027';
const when = (a, b) => `${L.fmtDays(a.days.filter(day => b.days.includes(day)))} ${L.fmtTime(Math.max(a.start, b.start))} - ${L.fmtTime(Math.min(a.end, b.end))}`;

// For each section number: the classes it overlaps and when.
function conflictMap(pairs) {
  const map = new Map();
  for (const [a, b] of pairs) {
    for (const [mine, other] of [[a, b], [b, a]]) {
      const list = map.get(mine.section) ?? [];
      list.push({ withName: `${courseName(other.course)} (${other.section})`, otherCourse: other.course, when: when(a, b) });
      map.set(mine.section, list);
    }
  }
  return map;
}

function requirementLabel(entry) {
  if (entry.src === 'ge') {
    const category = state.geAdded[entry.srcIndex].category;
    return state.mode === 'live' ? 'a general education requirement' : `${category} ${GE_CATEGORIES[category] ?? ''}`.trim();
  }
  const reqs = L.courseRequirements(entry.course.id, state.audit ?? { requirements: [] });
  if (reqs.length) return reqs[0];
  return entry.role === 'support' ? 'Needed alongside another course' : 'Elective';
}

function ratingFor(name) {
  if (state.mode === 'live') return null;
  const known = SAMPLE_RATINGS[name];
  const base = known ?? (() => { const r = demoRating(name); return { rating: r.score, count: r.count }; })();
  return { ...base, label: 'Sample rating', few: base.count < 5 };
}

function instructorBlock(sections) {
  const names = [...new Set(sections.flatMap(section => section.instructors ?? []))];
  if (!names.length) return h('p', { class: 'small muted' }, 'Instructor to be announced.');
  return h('ul', { class: 'profs' }, names.map(raw => {
    const name = prettyName(raw);
    return h('li', {}, h('b', {}, name), ratingLine(ratingFor(raw)),
      ext(L.rmpUrl(name), 'Rate My Professors', `Search Rate My Professors for ${name} (opens a new tab)`));
  }));
}

function sectionRows(sections, conflicts) {
  return h('ul', { class: 'secrows' }, sections.map(section => {
    const hit = conflicts.get(section.id);
    return h('li', { class: 'secrow' + (hit ? ' bad' : '') },
      h('span', { class: 'stype' }, section.mode), h('span', { class: 'snum' }, section.id),
      h('span', { class: 'swhen' }, L.fmtMeetings(section)),
      hit ? h('span', { class: 'tag bad' }, 'Conflict') : null,
      section.clearance ? h('span', { class: 'tag warn' }, 'Clearance') : null);
  }));
}

function planCard(entry, position, conflicts, pairs) {
  const { course, sections } = entry;
  const mine = pairs.filter(pair => pair.some(m => sections.some(section => section.id === m.section)));
  const found = mine.length ? swapPlan(mine[0]) : null;
  const problems = entry.src === 'plan' ? L.checkCourse(entry, state.confirmed, concurrent()).filter(check => check.level === 'error') : [];
  const clearance = sections.some(section => section.clearance);
  const seatLines = sections.filter(section => section.seats != null).map(section => `${section.mode} ${section.id}: ${seatLabel(section)}`);
  const options = L.swapOptions(items(), position, fixedItems(), state.prefs);
  return h('article', { class: 'plancard' + (mine.length ? ' has-conflict' : ''), tabindex: '-1', 'data-fk': `card-${safeKey(course.id)}`, 'aria-labelledby': `pc-${safeKey(course.id)}` },
    h('div', { class: 'pc-head' },
      h('h3', { id: `pc-${safeKey(course.id)}` }, h('span', { class: 'code' }, courseName(course.id)), ' ' + course.name),
      h('span', { class: 'units' }, `${L.fmtUnits(course.units)} units`)),
    h('p', { class: 'counts' }, h('span', { class: 'muted' }, 'Counts toward '), h('b', {}, requirementLabel(entry))),
    sectionRows(sections, conflicts),
    mine.length || clearance || problems.length ? h('ul', { class: 'warns' },
      mine.map(pair => { const info = conflicts.get(pair.find(m => sections.some(section => section.id === m.section)).section)?.[0]; return h('li', {}, icon('warn'), h('span', {}, `Overlaps ${info?.withName} on ${info?.when}.`)); }).slice(0, 1),
      clearance ? h('li', {}, icon('warn'), h('span', {}, 'Needs department clearance. Request it in WebReg first.')) : null,
      problems.map(check => h('li', {}, icon('warn'), h('span', {}, check.text)))) : null,
    found ? h('div', { class: 'pc-actions' },
      h('button', { class: 'btn primary sm', type: 'button', 'data-fk': `swap-${safeKey(course.id)}`, 'aria-describedby': `fix-${safeKey(course.id)}`, onclick: () => swap(mine[0]) }, icon('swap'), 'Swap section'),
      h('span', { class: 'small muted', id: `fix-${safeKey(course.id)}` }, `Moves to ${found.best.bundle.map(section => section.id).join(' + ')}${found.best.bundle[0].instructors?.[0] ? ` (${prettyName(found.best.bundle[0].instructors[0])})` : ''}`))
      : mine.length ? h('p', { class: 'small muted' }, 'No conflict-free section for this course. Try another option under Section details.') : null,
    h('details', { class: 'more' }, h('summary', {}, 'Section details'),
      instructorBlock(sections),
      seatLines.length ? h('ul', { class: 'list small' }, seatLines.map(line => h('li', {}, line))) : null,
      state.mode === 'demo' ? h('p', { class: 'small muted' }, 'Ratings and seat counts are sample data.') : null,
      course.bundles.length > 1 ? h('div', { class: 'field' }, h('label', { class: 'small', for: `tp-sw-${safeKey(course.id)}` }, 'Choose another section'),
        h('select', { id: `tp-sw-${safeKey(course.id)}`, 'data-fk': `sw-${safeKey(course.id)}`, onchange: event => { setIndex(position, Number(event.target.value)); state.copied = false; say(`${courseName(course.id)} section changed.`); render(); focusKey(`card-${safeKey(course.id)}`); } },
          course.bundles.map((bundle, index) => h('option', { value: String(index), selected: index === entry.index },
            `${bundle.map(section => section.id).join(' + ')} ${bundle[0].meetings[0] ? L.fmtMeeting(bundle[0].meetings[0]) : ''}${options[index]?.ok ? '' : ' (conflict)'}`)))) : null));
}

function registeredCard(item) {
  return h('article', { class: 'plancard reg' },
    h('div', { class: 'pc-head' }, h('h3', {}, h('span', { class: 'code' }, courseName(item.course.id)), ' ' + (item.course.name === item.course.id ? '' : item.course.name)),
      h('span', { class: 'units' }, `${L.fmtUnits(item.course.units)} units`)),
    h('p', { class: 'counts' }, h('span', { class: 'tag' }, 'Registered'), h('span', { class: 'muted' }, ' already on your schedule')),
    sectionRows(item.sections, new Map()));
}

function copyMessage() { return state.copyMsg ? h('span', { class: 'small ok-text', role: 'status' }, state.copyMsg) : null; }

function compareControl(pairs) {
  const open = state.compareOpen;
  const bin = binItems();
  return h('div', { class: 'compare' },
    h('div', { class: 'row' },
      h('button', { class: 'btn light sm', type: 'button', 'aria-expanded': String(open), 'aria-controls': 'tp-compare-body', 'data-fk': 'compare', onclick: () => { state.compareOpen = !state.compareOpen; render(); } }, 'Compare with myCourseBin'),
      state.bin ? h('span', { class: 'small muted' }, `${plural(bin.length, 'saved class', 'saved classes')} loaded`) : null,
      state.bin ? h('button', { class: 'btn link-btn sm', type: 'button', onclick: clearBin }, 'Clear') : null),
    open ? h('div', { id: 'tp-compare-body', class: 'compare-body' },
      state.mode === 'demo' ? h('button', { class: 'btn primary sm', type: 'button', 'data-fk': 'load-bin', onclick: () => { loadSampleBin(); } }, 'Load sample myCourseBin')
        : onCourseBin() ? h('button', { class: 'btn primary sm', type: 'button', onclick: readFromPage }, 'Read my myCourseBin')
          : h('p', { class: 'small muted' }, 'Open myCourseBin in WebReg, then choose Read my myCourseBin.'),
      h('form', { class: 'field', onsubmit: event => { event.preventDefault(); pasteBin(rootQuery('#tp-bin').value); } },
        h('label', { class: 'small muted', for: 'tp-bin' }, 'Or paste section numbers (five digits, separated by spaces or commas)'),
        h('div', { class: 'row' }, h('input', { id: 'tp-bin', type: 'text', maxlength: '240', autocomplete: 'off', spellcheck: 'false', value: state.binText, placeholder: '29202, 39601', oninput: event => { state.binText = event.target.value; } }), h('button', { class: 'btn light sm', type: 'submit' }, 'Check')),
        state.binNote ? h('p', { class: 'status-err', role: 'status' }, state.binNote) : null)) : null,
    state.bin?.unknown?.length ? h('p', { class: 'status-err', role: 'status' }, `Outside the snapshot: ${state.bin.unknown.join(', ')}. These sections could not be checked.`) : null,
    state.bin ? h('ul', { class: 'savedlist small' }, bin.map(item => h('li', {}, h('b', {}, courseName(item.course.id)), ' ' + item.sections.map(section => L.fmtMeetings(section)).join('; '))))
      : null);
}

function scheduleView() {
  const planned = items();
  const pairs = conflictPairs();
  const conflicts = conflictMap(pairs);
  const units = totalUnits(planned) + totalUnits(registered().filter(r => !planned.some(p => p.course.id === r.course.id)));
  const order = planned.map((entry, position) => ({ entry, position })).sort((a, b) => Number(pairs.some(p => p.some(m => b.entry.sections.some(s => s.id === m.section)))) - Number(pairs.some(p => p.some(m => a.entry.sections.some(s => s.id === m.section)))));
  const out = [];
  out.push(h('section', { class: 'card tight', 'aria-labelledby': 'tp-sum-h' },
    h('div', { class: 'between' },
      h('h3', { id: 'tp-sum-h', class: 'summary', role: 'status', 'aria-atomic': 'true' }, `${TERM} · ${L.fmtUnits(units)} units · `, h('span', { class: pairs.length ? 'bad-text' : 'ok-text' }, pairs.length ? plural(pairs.length, 'conflict') : 'no conflicts')),
      planned.length ? h('div', { class: 'row' }, h('button', { class: 'btn primary sm', type: 'button', 'data-fk': 'copy', onclick: copySections }, icon('copy'), 'Copy section numbers'), copyMessage()) : null),
    compareControl(pairs),
    pairs.length ? h('ul', { class: 'overlaps', 'aria-label': 'Overlaps' }, pairs.map(pair => h('li', {}, icon('warn'), h('span', {}, `${L.describeConflict(pair)}`)))) : null));
  if (!planned.length && !registered().length) out.push(emptySchedule());
  else {
    out.push(h('div', { class: 'cardlist' },
      order.map(({ entry, position }) => planCard(entry, position, conflicts, pairs)),
      registered().filter(r => !planned.some(p => p.course.id === r.course.id)).map(registeredCard)));
    out.push(h('details', { class: 'card more', open: true }, h('summary', {}, 'Weekly calendar'), calendarGrid(planned)));
  }
  return out;
}

function emptySchedule() {
  return h('section', { class: 'card empty' },
    h('h3', {}, 'Nothing planned yet'),
    h('p', { class: 'lead' }, 'Find a GE that fits your week, or plan courses for a requirement.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => { const ge = remainingGERows()[0]; startGE(L.geCategoryOf(ge?.title ?? '') ?? 'GE-B'); } }, 'Find a GE'),
      h('button', { class: 'btn light', type: 'button', onclick: () => { state.planView = 'ask'; render(); } }, 'Plan courses')));
}

function webregBanner() {
  const { bin, locked, pool } = state.webreg;
  const lockedUnits = totalUnits(locked);
  return h('section', { class: 'card', 'aria-labelledby': 'tp-live-h' },
    h('div', { class: 'between' }, h('h3', { id: 'tp-live-h' }, 'Your myCourseBin'), h('button', { class: 'btn light sm', type: 'button', onclick: readFromPage }, 'Read again')),
    h('p', { class: 'muted' }, `${plural(locked.length, 'class', 'classes')} registered (${L.fmtUnits(lockedUnits)} units). ${plural(pool.length, 'saved class', 'saved classes')} not registered yet. Read live from this page.`));
}

function renderWebregPlan(nav) {
  const result = state.webregResult;
  const planned = items();
  const { locked } = state.webreg;
  const goal = { prefs: state.prefs, strictLimit: state.strictLimit && state.prefs.units === state.strictLimit - 1 ? state.strictLimit : null, mentionsUnits: true };
  const total = totalUnits(planned) + result.lockedUnits;
  const rows = L.preferenceReport(goal, planned).filter(row => !/^Unit limit/.test(row.text));
  rows.unshift({ level: total <= state.prefs.units ? 'met' : 'missed', text: `Unit limit: ${L.fmtUnits(total)} of ${state.prefs.units} units (${L.fmtUnits(result.lockedUnits)} already registered).` });
  const bad = rows.filter(row => row.level !== 'met');
  fill(ui.plan, nav,
    webregBanner(),
    askCard(),
    h('section', { class: 'card', 'aria-labelledby': 'tp-sched-h' },
      h('h3', { id: 'tp-sched-h', tabindex: '-1', 'data-fk': 'schedule' }, 'Your schedule'),
      h('div', { class: 'understood' },
        h('p', { class: 'small muted' }, state.reader ? `I understood (read by ${state.reader}):` : 'I understood:'),
        h('ul', { class: 'chips' }, L.describeGoal(goal).map(chip => h('li', {}, chip))),
        bad.length ? h('ul', { class: 'checks' }, bad.map(row => h('li', {}, h('span', { class: `tag ${row.level === 'partial' ? 'warn' : 'bad'}` }, row.level === 'partial' ? 'Partly met' : 'Not met'), h('span', {}, row.text))))
          : h('p', { class: 'ok-text small' }, '✓ Every preference is met.'),
        result.relaxed.length ? h('p', { class: 'muted small' }, `No option avoided your time preference for ${result.relaxed.map(c => courseName(c.id)).join(', ')}.`) : null),
      calendarGrid(planned)),
    h('section', { class: 'card', 'aria-labelledby': 'tp-rec-h' },
      h('h3', { id: 'tp-rec-h' }, planned.length ? 'Recommended from your myCourseBin' : 'Nothing new to recommend'),
      planned.length ? planned.map((entry, i) => h('article', { class: `course c${i % 6}` },
        h('div', { class: 'between' }, h('h3', {}, `${courseName(entry.course.id)} ${entry.course.name}`), h('span', { class: 'tag' }, `${L.fmtUnits(entry.course.units)} units`)),
        h('ul', { class: 'sections' }, entry.sections.map(section => h('li', { class: 'section' },
          h('div', { class: 'between' }, h('span', {}, h('b', {}, `${section.mode} ${section.id}`), ` ${L.fmtMeetings(section)}`), h('button', { class: 'btn light sm', type: 'button', onclick: () => showOnPage(section.id) }, 'Show on page')),
          section.instructors.length ? h('ul', { class: 'profs' }, section.instructors.map(name => h('li', {}, h('span', { class: 'pname' }, prettyName(name)), ext(L.rmpUrl(prettyName(name)), 'Rate My Professors', `Search Rate My Professors for ${prettyName(name)} (opens a new tab)`)))) : null,
          h('div', { class: 'meta' }, h('span', {}, seatLabel(section)))))))) : h('p', { class: 'muted' }, 'Nothing saved in your myCourseBin can be added with these settings.'),
      result.skipped.length ? (planned.length
        ? h('details', { class: 'more' }, h('summary', {}, `Not recommended (${result.skipped.length})`), h('ul', { class: 'list' }, result.skipped.map(skip => h('li', {}, h('b', {}, courseName(skip.course.id)), ' ' + skip.reason))))
        : h('ul', { class: 'list', 'aria-label': 'Why nothing was recommended' }, result.skipped.map(skip => h('li', {}, h('b', {}, courseName(skip.course.id)), ' ' + skip.reason)))) : null,
      locked.length ? h('details', { class: 'more' }, h('summary', {}, `Already registered (${locked.length})`),
        h('ul', { class: 'list' }, locked.map(item => h('li', {}, h('b', {}, courseName(item.course.id)), ` ${item.course.name}, ${item.sections.map(sec => `${sec.mode} ${sec.id}`).join(', ')}`)))) : null),
    h('section', { class: 'card', 'aria-labelledby': 'tp-fin-h' },
      h('h3', { id: 'tp-fin-h' }, 'Finish in WebReg'),
      h('p', { class: 'muted' }, 'The recommended rows are outlined in red on this page. Click Schedule on them yourself. This panel never clicks anything in WebReg.'),
      L.sectionNumbers(planned).length ? h('p', { class: 'nums', 'aria-label': 'Section numbers' }, L.sectionNumbers(planned).join(' ')) : null,
      h('button', { class: 'btn primary', type: 'button', 'data-fk': 'copy', disabled: !planned.length, onclick: copySections }, icon('copy'), state.copied ? 'Copied. Copy again' : 'Copy section numbers')));
}

function askCard() {
  const rows = remainingRows();
  const p = state.prefs;
  const focusTitle = state.focus?.title ?? 'All remaining requirements';
  return h('section', { class: 'card ask', 'aria-labelledby': 'tp-ask-h' },
    h('h3', { id: 'tp-ask-h', tabindex: state.planView === 'ge' ? '-1' : null, 'data-fk': state.planView === 'ge' ? 'ge-heading' : null }, state.planView === 'ge' ? 'Find a GE that fits' : 'What do you want this semester?'),
    state.planView === 'ge' ? null : h('p', { class: 'muted' }, 'Describe it in plain words. The planner picks courses and sections that fit.'),
    h('form', { class: 'askbox' + (state.planView === 'ge' ? ' inline' : ''), onsubmit: event => { event.preventDefault(); buildFromPrompt(rootQuery('#tp-prompt').value); } },
      h('input', { id: 'tp-prompt', type: 'text', maxlength: '220', autocomplete: 'off', spellcheck: 'false', value: state.promptText, placeholder: state.planView === 'ge' || (state.mode === 'demo' && state.audit) ? GE_EXAMPLE : EXAMPLE_PROMPT, 'aria-label': 'Describe your semester', 'data-fk': 'prompt', oninput: event => { state.promptText = event.target.value; } }),
      h('button', { class: 'btn primary', type: 'submit', 'data-fk': 'build' }, state.planView === 'ge' ? 'Find' : state.plan ? 'Update schedule' : 'Build schedule')),
    h('div', { class: 'examples', role: 'group', 'aria-label': 'Example requests' }, h('span', { class: 'muted small' }, 'Try:'),
      EXAMPLES.map(example => h('button', { class: 'chip-btn', type: 'button', onclick: () => { state.promptText = example.text; buildFromPrompt(example.text); } }, example.label))),
    state.busy ? h('p', { class: 'small', role: 'status', 'data-busy': '' }, state.busy) : null,
    state.promptNote ? h('p', { class: 'status-err', role: 'status' }, state.promptNote) : null,
    state.planView === 'ge' ? geChips() : null,
    state.webreg || state.planView === 'ge' ? null : h('div', { class: 'field' }, h('label', { for: 'tp-focus' }, 'Planning for'),
      h('select', { id: 'tp-focus', 'data-fk': 'focus', onchange: event => { const value = event.target.value; startFocus(value === '__all' ? null : rows.find(row => row.title === value)); } },
        h('option', { value: '__all', selected: focusTitle === 'All remaining requirements' }, 'All remaining requirements'),
        rows.map(row => h('option', { value: row.title, selected: row.title === focusTitle }, row.title)))),
    state.planView === 'ge' ? null : h('details', { class: 'more' }, h('summary', {}, 'More options'),
      h('div', { class: 'field' }, h('label', { for: 'tp-units' }, 'Unit limit'),
        h('select', { id: 'tp-units', 'data-fk': 'units', onchange: event => setPrefs({ units: Number(event.target.value) }) },
          [...new Set([...UNIT_CHOICES, p.units])].sort((a, b) => a - b).map(n => h('option', { value: String(n), selected: n === p.units }, `Up to ${n} units`)))),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', 'data-fk': 'morning', checked: p.morning > 0, onchange: event => setPrefs({ morning: event.target.checked ? 600 : 0 }) }), `Avoid classes before ${L.fmtTime(p.morning || 600)}`),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', 'data-fk': 'late', checked: p.latest != null, onchange: event => setPrefs({ latest: event.target.checked ? 1020 : null }) }), `Avoid classes after ${L.fmtTime(p.latest ?? 1020)}`),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', 'data-fk': 'sequence', checked: p.sequence, onchange: event => setPrefs({ sequence: event.target.checked }) }), 'Prioritize prerequisites')));
}



const TIME_CHOICES = [[0, 'No limit'], [480, '8:00 AM'], [540, '9:00 AM'], [600, '10:00 AM'], [660, '11:00 AM'], [720, '12:00 PM']];
const END_CHOICES = [[null, 'No limit'], [900, '3:00 PM'], [960, '4:00 PM'], [1020, '5:00 PM'], [1080, '6:00 PM'], [1200, '8:00 PM']];

function chip(label, control) { return h('label', { class: 'echip' }, h('span', {}, label), control); }

// The interpreted settings, as editable chips. Changing one re-runs the (deterministic) finder immediately.
function geChips() {
  const p = state.prefs;
  const live = state.mode === 'live';
  return h('div', { class: 'gechips' },
    h('p', { class: 'small muted' }, state.reader ? `I understood this (read by ${state.reader}). Fix anything that is wrong:` : 'Settings for this search. Change anything:'),
    h('div', { class: 'echips' },
      chip('Category', live
        ? h('select', { 'data-fk': 'ge-cat', disabled: true, 'aria-label': 'Category' }, h('option', {}, 'GE (not shown by WebReg)'))
        : h('select', { 'data-fk': 'ge-cat', 'aria-label': 'GE category', onchange: event => setGECategory(event.target.value) },
          Object.entries(GE_CATEGORIES).map(([id, name]) => h('option', { value: id, selected: id === state.ge.category }, `${id} ${name}`)))),
      chip('Up to', h('select', { 'data-fk': 'ge-units', 'aria-label': 'Unit limit', onchange: event => setPrefs({ units: Number(event.target.value) }) },
        [...new Set([...UNIT_CHOICES, p.units])].sort((a, b) => a - b).map(n => h('option', { value: String(n), selected: n === p.units }, `${n} units`)))),
      chip('Starts no earlier than', h('select', { 'data-fk': 'ge-start', 'aria-label': 'Earliest start', onchange: event => setPrefs({ morning: Number(event.target.value) }) },
        [...new Map([...TIME_CHOICES, [p.morning || 0, p.morning ? L.fmtTime(p.morning) : 'No limit']]).entries()].sort((a, b) => a[0] - b[0]).map(([value, label]) => h('option', { value: String(value), selected: value === (p.morning || 0) }, label)))),
      chip('Ends by', h('select', { 'data-fk': 'ge-end', 'aria-label': 'Latest end', onchange: event => setPrefs({ latest: event.target.value === '' ? null : Number(event.target.value) }) },
        [...new Map([...END_CHOICES, [p.latest ?? null, p.latest != null ? L.fmtTime(p.latest) : 'No limit']]).entries()].sort((a, b) => (a[0] ?? 1e9) - (b[0] ?? 1e9)).map(([value, label]) => h('option', { value: value == null ? '' : String(value), selected: value === (p.latest ?? null) }, label)))),
      h('button', { class: 'echip toggle-chip', type: 'button', 'data-fk': 'ge-rating', 'aria-pressed': String(p.ratingFirst !== false), onclick: () => setPrefs({ ratingFirst: p.ratingFirst === false }) },
        h('span', {}, p.ratingFirst !== false ? '✓ Highly rated first' : 'Highly rated first: off'))),
    h('p', { class: 'small ailine' }, h('b', {}, 'What the AI does: '), `it only turns your sentence into these settings${state.reader ? ` (this time: ${state.reader})` : ''}. It never picks courses. Everything else is plain code.`),
    h('details', { class: 'more' },
      h('summary', {}, 'What is plain code'),
      h('ul', { class: 'list' },
        h('li', {}, 'GE category match, prerequisites, section conflicts (including the required discussion or lab), your unit limit and the ranking.'),
        h('li', {}, state.mode === 'live' ? 'Live mode shows real sections from this page. Ratings are not loaded; use the Rate My Professors link.' : 'Courses, instructors, seat counts and ratings are fictional sample data, labeled as such.'))));
}

function ratingLine(rating) {
  if (!rating) return h('p', { class: 'small muted' }, state.mode === 'live' ? 'Rating not loaded' : 'No rating found');
  const fillBar = h('span', { class: 'rate-fill' });
  fillBar.style.width = `${(rating.rating / 5) * 100}%`;
  return h('div', { class: 'rate-line' },
    h('span', { class: 'rate', role: 'img', 'aria-label': `${rating.label}: ${rating.rating.toFixed(1)} out of 5 from ${rating.count} reviews` },
      h('span', { class: 'rate-track', 'aria-hidden': 'true' }, fillBar), h('b', { 'aria-hidden': 'true' }, rating.rating.toFixed(1)), h('small', { 'aria-hidden': 'true' }, '/5')),
    h('span', { class: 'small' }, plural(rating.count, 'review')),
    h('span', { class: 'tag' }, rating.label),
    rating.few ? h('span', { class: 'tag warn' }, 'Few reviews') : null);
}

const ADD_TAG = { yes: ['ok', 'Yes'], check: ['warn', 'Check first'], clearance: ['warn', 'Needs clearance'], waitlist: ['warn', 'Full: waitlist'] };

function geResultCard(result, rank) {
  const category = state.ge.category;
  const added = plannedGE(category);
  const isAdded = added && added.course.id === result.course.id && added.index === result.index;
  const label = state.mode === 'live' ? 'GE (category not shown by WebReg)' : `${category} ${GE_CATEGORIES[category] ?? ''}`;
  const [tagClass, tagText] = ADD_TAG[result.canAdd.status];
  const name = result.instructor ? prettyName(result.instructor) : null;
  return h('article', { class: 'geres' + (rank === 0 ? ' best' : '') },
    h('div', { class: 'between' },
      h('h3', {}, `${courseName(result.course.id)} ${result.course.name}`),
      h('span', { class: 'tag' + (rank === 0 ? ' focus' : '') }, rank === 0 ? 'Best match' : `#${rank + 1}`)),
    h('p', { class: 'geexp' }, result.explanation),
    h('dl', { class: 'geq' },
      h('div', {}, h('dt', {}, 'Counts for'), h('dd', {}, label, result.tags.length > 1 || state.mode === 'demo' ? h('span', { class: 'small muted' }, ` (${result.tags.join(', ')}, ${L.fmtUnits(result.units)} units)`) : null)),
      h('div', {}, h('dt', {}, 'Meets'), h('dd', {}, result.sections.map(section => h('span', { class: 'meet' }, h('b', {}, `${section.mode} ${section.id}`), ' ' + L.fmtMeetings(section))))),
      h('div', {}, h('dt', {}, 'Taught by'), h('dd', {}, name ? [h('b', {}, name), ratingLine(result.rating),
        ext(L.rmpUrl(name), state.mode === 'demo' ? 'Search Rate My Professors' : 'Rate My Professors', `Search Rate My Professors for ${name} (opens a new tab)`)] : 'Instructor to be announced')),
      h('div', {}, h('dt', {}, 'Can I add it?'), h('dd', {}, h('span', { class: `tag ${tagClass}` }, tagText), ' ' + result.canAdd.text))),
    result.notes.length ? h('ul', { class: 'list small' }, result.notes.map(note => h('li', {}, note))) : null,
    h('button', { class: 'btn primary', type: 'button', 'data-fk': `add-${safeKey(result.key)}`, disabled: Boolean(isAdded), onclick: () => addGE(result) }, isAdded ? 'Added to plan' : added ? 'Replace my plan with this' : 'Add to plan'));
}

function geBlocked(result) {
  return h('details', { class: 'more' }, h('summary', {}, `Not shown (${result.blocked.length})`),
    h('ul', { class: 'blocked' }, result.blocked.map(entry => h('li', {},
      h('b', {}, `${courseName(entry.course.id)} ${entry.course.name}`),
      entry.reasons.map(reason => h('div', {}, h('p', { class: 'small' }, reason.text),
        reason.action ? h('button', { class: 'btn light sm', type: 'button', onclick: () => setPrefs(reason.action.patch) }, reason.action.label) : null))))));
}

function geResults(result) {
  const category = state.ge.category;
  const label = state.mode === 'live' ? 'a GE-flagged class' : `${category} ${GE_CATEGORIES[category] ?? ''}`;
  const top = result.blocked.slice(0, 3);
  return h('section', { class: 'card', 'aria-labelledby': 'tp-ger-h' },
    h('h3', { id: 'tp-ger-h' }, result.viable.length ? `Best options for ${label}` : `Nothing fits for ${label} yet`),
    result.viable.length ? h('p', { class: 'muted small' }, `${plural(result.viable.length, 'section')} fit your schedule and limits. Ranked by instructor rating, adjusted for review count so one 5.0 review does not beat dozens of 4.8s.`) : null,
    result.viable.map((entry, i) => geResultCard(entry, i)),
    !result.viable.length ? h('div', { class: 'alert', role: 'status' },
      h('h4', {}, 'What is in the way'),
      result.blocked.length ? h('ul', { class: 'list' }, top.map(entry => h('li', {}, h('b', {}, courseName(entry.course.id)), ' ' + (entry.reasons[0]?.text ?? '')))) : h('p', {}, state.mode === 'live' ? 'No GE-flagged classes were read yet.' : 'No sections carry this category in the sample catalog.'),
      result.suggestion ? h('button', { class: 'btn primary sm', type: 'button', onclick: () => setPrefs(result.suggestion.patch) }, `${result.suggestion.label} (shows ${result.suggestion.wouldShow})`) : null) : null,
    result.blocked.length ? geBlocked(result) : null);
}

function liveGEBanner() {
  return h('section', { class: 'card', 'aria-labelledby': 'tp-livege-h' },
    h('h3', { id: 'tp-livege-h' }, 'Live data from this page'),
    h('p', { class: 'muted' }, 'Reads the GE-flagged classes listed on the WebReg page you have open, such as a department course list. Nothing is clicked.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary sm', type: 'button', onclick: readLiveGE }, 'Read this page'),
      onCourseBin() ? h('button', { class: 'btn light sm', type: 'button', onclick: readFromPage }, 'Read my myCourseBin') : null),
    h('p', { class: 'small muted' }, `Your schedule: ${registered().length ? plural(registered().length, 'registered class', 'registered classes') + ' known (read from myCourseBin on this page).' : 'not read on this page. Fit checks cannot include registered classes from other pages.'}`),
    state.live.note ? h('p', { class: 'small', role: 'status' }, state.live.note) : null);
}



function chooseGECourse(course) {
  const category = state.ge.category;
  state.geChosen[category] = { term: state.ge.term, course };
  delete state.moves[`ge:${category}`];
  say(`${courseName(course.id)} chosen for ${state.ge.term}. ${category} is Planned there.`);
  state.boardSel = `ge:${category}`;
  if (state.shell === 'page') setView('four'); else render();
}

function geCoursesOnly() {
  const category = state.ge.category;
  const courses = GE_COURSES.filter(course => course.ge.includes(category));
  return [h('section', { class: 'card', 'aria-labelledby': 'tp-gco-h' },
    h('h3', { id: 'tp-gco-h', tabindex: '-1', 'data-fk': 'ge-heading' }, `Choose a ${category} course for ${state.ge.term}`),
    h('p', { class: 'muted small' }, `Sections for ${state.ge.term} are not published yet, so times and instructor ratings are not available. Pick the course now; compare sections when registration opens.`),
    h('ul', { class: 'blocked' }, courses.map(course => h('li', {},
      h('b', {}, `${courseName(course.id)} ${course.name}`),
      h('p', { class: 'small muted' }, `${L.fmtUnits(course.units)} units${course.prereq.length ? '. Has a prerequisite, check it first.' : ''}`),
      h('button', { class: 'btn light sm', type: 'button', onclick: () => chooseGECourse(course) }, `Choose for ${state.ge.term}`)))),
    h('button', { class: 'btn primary sm', type: 'button', onclick: () => startGE(category, PLAN_TERM) }, `Compare real sections for ${PLAN_TERM} instead`))];
}

function geView() {
  if (state.mode === 'demo' && state.ge.category && state.ge.term && state.ge.term !== PLAN_TERM) return geCoursesOnly();
  const result = state.ge.result;
  const pairs = conflictPairs();
  const units = totalUnits(items()) + totalUnits(registered().filter(r => !items().some(p => p.course.id === r.course.id)));
  return [
    state.mode === 'live' ? liveGEBanner() : null,
    result ? geResults(result) : h('section', { class: 'card empty' }, h('h3', {}, 'Pick a GE category'), h('p', { class: 'lead' }, 'Choose one above, or tap Find courses next to a GE on Degree Progress.')),
    h('p', { class: 'small muted viewlink' }, `${TERM} · ${L.fmtUnits(units)} units · ${pairs.length ? plural(pairs.length, 'conflict') : 'no conflicts'}. `,
      h('button', { class: 'btn link-btn', type: 'button', onclick: () => { state.planView = 'schedule'; render(); } }, 'View schedule')),
  ];
}

function calendarGrid(planned) {
  const taken = new Set(planned.flatMap(({ sections }) => sections.map(section => section.id)));
  const events = L.markConflicts([
    ...L.calendarEvents(planned, 'plan'),
    ...L.calendarEvents(registered().map(item => ({ course: item.course, sections: item.sections.filter(section => !taken.has(section.id)) })), 'reg'),
    ...L.calendarEvents(binItems().map(item => ({ course: item.course, sections: item.sections.filter(section => !taken.has(section.id)) })), 'bin'),
  ]);
  const color = new Map(planned.map(({ course }, i) => [course.id, `c${i % 6}`]));
  const days = Array.from({ length: Math.max(4, ...events.map(event => event.day)) + 1 }, (_, i) => i);
  const startHour = events.length ? Math.min(8, Math.floor(Math.min(...events.map(event => event.start)) / 60)) : 8;
  const endHour = events.length ? Math.max(18, Math.ceil(Math.max(...events.map(event => event.end)) / 60)) : 18;
  const span = (endHour - startHour) * 60;
  const grid = h('div', { class: 'cal', role: 'table', 'aria-label': 'Weekly schedule' });
  grid.style.setProperty('--days', String(days.length));
  grid.style.setProperty('--hours', String(endHour - startHour));
  grid.append(h('div', { class: 'cal-corner', role: 'columnheader' }), ...days.map(day => h('div', { class: 'cal-head', role: 'columnheader' }, L.DAYS[day])),
    h('div', { class: 'cal-times', role: 'rowheader' }, Array.from({ length: endHour - startHour }, (_, i) => h('span', {}, L.fmtTime((startHour + i) * 60).replace(':00', '')))));
  for (const day of days) {
    const column = h('div', { class: 'cal-col', role: 'cell' });
    for (const event of L.layoutColumns(events.filter(item => item.day === day))) {
      const block = h('div', { class: `ev ${color.get(event.course) ?? event.kind}${event.conflict ? ' conflict' : ''}${event.kind === 'bin' ? ' bin' : ''}${event.kind === 'reg' ? ' reg' : ''}`,
        title: `${courseName(event.course)} ${event.mode} ${event.section}, ${L.fmtTime(event.start)} - ${L.fmtTime(event.end)}${event.kind === 'bin' ? ' (existing, in myCourseBin)' : ''}${event.kind === 'reg' ? ' (already registered)' : ''}${event.conflict ? ' (conflict)' : ''}` },
        h('b', {}, courseName(event.course)), h('span', {}, L.fmtTime(event.start).replace(' ', '')),
        event.conflict ? h('i', { class: 'flag' }, 'Conflict') : event.kind === 'bin' ? h('i', { class: 'flag existing' }, 'Existing') : null);
      block.style.top = `${((event.start - startHour * 60) / span) * 100}%`;
      block.style.height = `${((event.end - event.start) / span) * 100}%`;
      block.style.left = `${(event.col / event.cols) * 100}%`;
      block.style.width = `${100 / event.cols}%`;
      column.append(block);
    }
    grid.append(column);
  }
  return h('div', {},
    grid,
    h('p', { class: 'cal-key' }, h('span', {}, h('i', { class: 'swatch rec' }), 'Planned'), h('span', {}, h('i', { class: 'swatch regd' }), 'Registered'), h('span', {}, h('i', { class: 'swatch exist' }), 'In myCourseBin'), h('span', {}, h('i', { class: 'swatch bad' }), 'Conflict')));
}


function seatLabel(section) {
  if (state.webreg && section.seats != null) return section.seats === 0 ? 'Full (live on this page)' : `${plural(section.seats, 'seat')} open (live on this page)`;
  if (section.seats == null) return 'Seats not reported';
  const text = section.seats === 0 ? 'Full' : plural(section.seats, 'seat') + ' open';
  return `${text} (${state.isDemo || state.bin?.demo ? 'demo data' : 'snapshot'})`;
}

function rating(name) {
  const { score, count } = demoRating(name);
  const fillBar = h('span', { class: 'rate-fill' });
  fillBar.style.width = `${(score / 5) * 100}%`;
  return h('span', { class: 'rate', role: 'img', 'aria-label': `Demo rating ${score} out of 5 for ${name}, from ${count} sample reviews. Not from Rate My Professors.` },
    h('span', { class: 'rate-track', 'aria-hidden': 'true' }, fillBar), h('b', { 'aria-hidden': 'true' }, score.toFixed(1)), h('small', { 'aria-hidden': 'true' }, '/5'),
    h('span', { class: 'tag', 'aria-hidden': 'true' }, 'Demo'));
}

function sectionRow(section) {
  return h('li', { class: 'section' },
    h('div', {}, h('b', {}, `${section.mode} ${section.id}`), ` ${L.fmtMeetings(section)}`),
    section.instructors.length
      ? h('ul', { class: 'profs', 'aria-label': 'Instructors' }, section.instructors.map(name =>
        h('li', {}, h('span', { class: 'pname' }, state.webreg ? prettyName(name) : name), state.webreg ? null : rating(name), ext(L.rmpUrl(state.webreg ? prettyName(name) : name), 'Rate My Professors', `Search Rate My Professors for ${state.webreg ? prettyName(name) : name} (opens a new tab)`))))
      : h('p', { class: 'small muted' }, 'Instructor to be announced'),
    h('div', { class: 'meta' }, h('span', {}, seatLabel(section)), section.clearance ? h('span', {}, 'Department clearance listed. Check WebReg.') : null));
}





// ---- Shell --------------------------------------------------------------------------------

// ---- Four-Year Plan ---------------------------------------------------------------------------------------------
const BOX_LABEL = { completed: 'Completed', inprogress: 'In progress', planned: 'Planned', registered: 'Registered', estimate: 'Estimate', open: 'Open' };

function boardData() {
  const planned = items().map(entry => ({ ...entry, category: entry.src === 'ge' ? state.geAdded[entry.srcIndex].category : null, reqLabel: requirementLabel(entry) }));
  const titles = new Map();
  for (const program of [state.major, state.minor]) for (const group of program?.groups ?? []) for (const course of group.courses) titles.set(courseKey(course.code), course.title);
  return buildBoard({ rows: state.audit?.requirements ?? [], past: state.profile?.roadmap ?? [], registered: registered(), planned, geChosen: state.geChosen, moves: state.moves,
    load: state.prefs.units, remainingUnits: L.unitSummary(state.audit ?? {}).remaining, titles });
}

const allBoxes = board => board.terms.flatMap(term => term.boxes.map(box => ({ ...box, term: term.label })));
function selectBox(id) { state.boardSel = id; render(); focusKey('bd-head'); }
function closeBox() { const id = state.boardSel; state.boardSel = null; render(); focusKey(`bc-${safeKey(id)}`); }

function moveBox(box, term) {
  state.moves[box.key] = term;
  const board = boardData();
  const moved = allBoxes(board).find(b => b.id === box.id || b.key === box.key);
  say(`${box.code} moved to ${term}.${moved?.issue ? ` Prerequisite issue: ${moved.issue}` : ' No prerequisite issues.'}`);
  render();
  focusKey(`bc-${safeKey(box.id)}`);
}

function boardCard(box) {
  const selected = state.boardSel === box.id;
  return h('li', {}, h('button', { class: `bcard ${box.status}${box.issue ? ' issue' : ''}${selected ? ' sel' : ''}`, type: 'button', 'aria-pressed': String(selected), 'data-fk': `bc-${safeKey(box.id)}`, onclick: () => selectBox(box.id) },
    h('span', { class: 'bc-top' }, h('b', {}, box.code), h('span', { class: 'bc-units' }, `${L.fmtUnits(box.units)} units`)),
    box.title ? h('span', { class: 'bc-title' }, box.title) : null,
    box.req ? h('span', { class: 'bc-req' }, box.req) : null,
    h('span', { class: 'bc-foot' }, h('span', { class: 'tag' + (box.status === 'open' ? ' warn' : '') }, BOX_LABEL[box.status]), box.issue ? h('span', { class: 'tag bad' }, icon('warn'), 'Prerequisite issue') : null)));
}

function termColumn(term, season) {
  if (!term) return h('div', { class: 'bterm blank', 'aria-hidden': 'true' });
  const now = term.label === NOW_TERM, plan = term.label === PLAN_TERM;
  return h('section', { class: `bterm${now ? ' current' : ''}${plan ? ' planning' : ''}`, 'aria-labelledby': `bt-${safeKey(term.label)}` },
    h('h4', { id: `bt-${safeKey(term.label)}` }, h('span', {}, season), h('span', { class: 'bt-units' }, `${L.fmtUnits(term.units)} units`)),
    now ? h('p', { class: 'tag focus' }, 'Current term') : plan ? h('p', { class: 'tag' }, 'Registering now') : null,
    h('ul', { class: 'bcards' }, term.boxes.length ? term.boxes.map(boardCard) : h('li', { class: 'muted small' }, 'Nothing here yet.')));
}

function boardDetail(board) {
  const box = allBoxes(board).find(b => b.id === state.boardSel);
  if (!box) return null;
  const rules = L.catalog.get(box.key);
  const prereq = rules?.prereq?.length ? L.describeRule(rules.prereq) : null;
  const coreq = rules?.coreq?.length ? L.describeRule(rules.coreq) : null;
  const movable = box.movable && (box.kind === 'ge-slot' || box.status === 'estimate');
  const terms = (box.kind === 'ge-slot' ? [PLAN_TERM, ...FUTURE_TERMS] : FUTURE_TERMS).slice(0, 8);
  return h('section', { class: 'card bdetail', 'aria-labelledby': 'bd-head' },
    h('div', { class: 'between' },
      h('h3', { id: 'bd-head', tabindex: '-1', 'data-fk': 'bd-head' }, `${box.code}${box.title ? ' · ' + box.title : ''}`),
      h('button', { class: 'btn light sm', type: 'button', onclick: closeBox }, 'Close')),
    h('p', { class: 'small' }, h('span', { class: 'tag' }, BOX_LABEL[box.status]), ` ${box.term} · ${L.fmtUnits(box.units)} units${box.req ? ' · Counts toward ' + box.req : ''}`),
    box.issue ? h('p', { class: 'alert', role: 'status' }, icon('warn'), ' ' + box.issue) : null,
    box.kind === 'course' ? h('ul', { class: 'list small' },
      h('li', {}, h('b', {}, 'Prerequisites: '), prereq ?? 'None listed in the bundled data. Check the catalogue or WebReg.'),
      coreq ? h('li', {}, h('b', {}, 'Corequisites: '), coreq) : null,
      box.note ? h('li', {}, h('b', {}, 'Note: '), box.note) : null) : null,
    box.sections?.length ? h('div', {}, h('h4', {}, `Sections for ${box.term}`), sectionRows(box.sections, new Map()), instructorBlock(box.sections)) : null,
    box.kind === 'ge-slot' ? h('button', { class: 'btn primary', type: 'button', 'data-fk': 'find-slot', onclick: () => startGE(box.category, box.term) }, `Find a ${box.category} for ${box.term}`) : null,
    box.status === 'planned' && box.term === PLAN_TERM ? h('button', { class: 'btn light', type: 'button', onclick: () => setView('plan') }, 'Open Plan Semester') : null,
    movable ? h('form', { class: 'field move', onsubmit: event => { event.preventDefault(); moveBox(box, rootQuery('#bd-term').value); } },
      h('label', { for: 'bd-term' }, 'Move to another term'),
      h('div', { class: 'row nowrap' },
        h('select', { id: 'bd-term', 'data-fk': 'bd-term' }, terms.map(label => h('option', { value: label, selected: label === box.term }, label))),
        h('button', { class: 'btn light sm', type: 'submit' }, 'Move'))) : null);
}

function renderFour() {
  if (!state.audit && !state.major) {
    fill(ui.four, h('section', { class: 'card empty' }, h('h3', {}, 'Your path to graduation'), h('p', { class: 'lead' }, 'Choose a major below, or try the sample student to see a full four-year plan.'),
      h('button', { class: 'btn primary', type: 'button', onclick: loadSample }, 'Try sample audit')), programCard());
    return;
  }
  const board = boardData();
  const unit = L.unitSummary(state.audit ?? {});
  const plannedUnits = board.terms.filter(t => t.status === 'plan').flatMap(t => t.boxes).filter(b => b.status === 'planned' || b.status === 'registered').reduce((n, b) => n + b.units, 0);
  const yi = Math.min(state.yearIndex ?? Math.max(0, board.years.findIndex(year => year.fall.label === NOW_TERM || year.spring?.label === NOW_TERM || year.spring?.label === PLAN_TERM)), board.years.length - 1);
  const program = [state.major?.name, state.minor?.name].filter(Boolean).join(' + ') || 'No program chosen';
  fill(ui.four,
    h('section', { class: 'card tight topbar', 'aria-labelledby': 'fy-h' },
      h('div', { class: 'between' }, h('h2', { id: 'fy-h', class: 'fy-title' }, program), h('button', { class: 'btn light sm', type: 'button', onclick: () => { ui.root.querySelector('.programs')?.setAttribute('open', ''); setView('progress'); } }, 'Change program')),
      h('p', { class: 'small muted' }, `Catalog year ${state.major?.catalog ?? programIndex?.catalog ?? '2026-2027'} · Target graduation ${board.lastTerm} (units-based projection)`),
      h('dl', { class: 'figures' },
        h('div', {}, h('dt', {}, 'Earned'), h('dd', {}, unit.earned == null ? 'Not found' : `${L.fmtUnits(unit.earned)} units`)),
        h('div', {}, h('dt', {}, 'Planned'), h('dd', {}, `${L.fmtUnits(plannedUnits)} units this term`)),
        h('div', {}, h('dt', {}, 'Open'), h('dd', {}, plural(board.openCount, 'requirement'))))),
    board.issues.length ? h('section', { class: 'card tight alert', role: 'status', 'aria-label': 'Prerequisite issues' },
      h('h3', {}, `${plural(board.issues.length, 'prerequisite issue')}`),
      h('ul', { class: 'list small' }, board.issues.slice(0, 5).map(issue => h('li', {}, h('button', { class: 'btn link-btn', type: 'button', onclick: () => selectBox(issue.id) }, `${issue.code} in ${issue.term}`), `: ${issue.text}`)))) : null,
    h('div', { class: 'yearsel', role: 'group', 'aria-label': 'Choose a year' }, board.years.map(year => h('button', { class: 'chip-btn', type: 'button', 'aria-pressed': String(year.index === yi), onclick: () => { state.yearIndex = year.index; render(); } }, year.label))),
    h('div', { class: 'years' }, board.years.map(year => h('section', { class: 'byear' + (year.index === yi ? ' sel' : ''), 'aria-labelledby': `by-${year.index}` },
      h('h3', { id: `by-${year.index}` }, year.label),
      h('div', { class: 'terms' }, termColumn(year.fall, 'Fall'), termColumn(year.spring, 'Spring'))))),
    boardDetail(board));
}

function renderHeader() {
  const demo = state.mode === 'demo';
  const drawer = state.shell === 'drawer';
  fill(ui.head,
    ui.mark.cloneNode(true),
    h('h2', { tabindex: '-1', 'data-fk': 'title' }, 'Troy', h('b', {}, 'Plan')),
    h('button', { class: `datapill ${demo ? 'demo' : 'live'}`, type: 'button', 'data-fk': 'mode-toggle', 'aria-pressed': String(demo),
      'aria-label': demo ? 'Demo data is on. Switch to live data.' : 'Live data is on. Switch to demo data.', onclick: () => setMode(demo ? 'live' : 'demo') }, demo ? 'Demo data' : 'Live data'),
    drawer ? h('a', { class: 'headlink', href: WEBSITE_URL, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open the TroyPlan website (opens a new tab)' }, h('span', { class: 'long' }, 'Open website'), h('span', { class: 'short' }, 'Website'), icon('out')) : null,
    drawer ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close TroyPlan', 'data-fk': 'close', onclick: close }, icon('close')) : null);
}

const HASH = { progress: 'degree-progress', four: 'four-year', plan: 'plan-semester' };
function setView(view) {
  state.view = view;
  if (state.shell === 'page') { try { history.replaceState(null, '', `#${HASH[view]}`); } catch { /* ignore */ } }
  render();
  scrollTop();
}

function renderTabs() {
  const pairs = hasPlanned() ? conflictPairs().length : 0;
  const views = state.shell === 'page' ? ['progress', 'four', 'plan'] : ['progress', 'plan'];
  const label = { progress: 'Degree Progress', four: 'Four-Year Plan', plan: 'Semester Plan' }; label.plan = 'Plan Semester';
  const go = id => setView(id);
  const tab = id => h('button', { class: 'tab', type: 'button', role: 'tab', id: `tp-tab-${id}`, 'aria-selected': String(state.view === id), 'aria-controls': `tp-view-${id}`, tabindex: state.view === id ? '0' : '-1', 'data-fk': `tab-${id}`,
    onclick: () => go(id),
    onkeydown: event => {
      const i = views.indexOf(id);
      const next = event.key === 'ArrowRight' ? views[(i + 1) % views.length] : event.key === 'ArrowLeft' ? views[(i + views.length - 1) % views.length] : event.key === 'Home' ? views[0] : event.key === 'End' ? views.at(-1) : null;
      if (next) { event.preventDefault(); go(next); focusKey(`tab-${next}`); }
    } }, label[id], id === 'plan' && pairs ? h('span', { class: 'count', 'aria-label': plural(pairs, 'conflict') }, String(pairs)) : null);
  fill(ui.tabs, views.map(tab));
  ui.tabs.style.setProperty('--tabs', String(views.length));
}

function renderNext() {
  const next = nextAction();
  fill(ui.next, h('p', {}, next.hint), h('button', { class: 'btn primary', type: 'button', 'data-fk': 'next', disabled: Boolean(next.disabled), onclick: () => { if (next.step >= 3) state.view = 'plan'; next.run(); } }, next.label));
}

function renderBusy() { const el = rootQuery('[data-busy]'); if (el) el.textContent = state.busy; }
function renderToast() { if (ui) ui.toast.textContent = state.toast; }

function render() {
  withFocus(() => {
    const page = state.shell === 'page';
    ui.panel.classList.toggle('open', state.open || page);
    ui.panel.classList.toggle('page', page);
    ui.panel.toggleAttribute('inert', !state.open && !page);
    ui.panel.setAttribute('aria-hidden', String(!state.open && !page));
    ui.launcher.hidden = state.open || page;
    ui.progress.hidden = state.view !== 'progress';
    ui.four.hidden = state.view !== 'four' || !page;
    ui.plan.hidden = state.view !== 'plan';
    ui.next.hidden = true; // actions live in context (cards, summary); no persistent bottom bar
    renderHeader(); renderTabs(); renderProgress(); if (page) renderFour(); renderPlan(); renderNext(); renderToast();
  });
}

function open() { state.open = true; render(); focusKey('title'); }
function close() { state.open = false; render(); ui.launcher.focus({ preventScroll: true }); }

export async function mountPlanner({ demo = false, shell = 'drawer', container = null } = {}) {
  const existing = document.getElementById(HOST_ID);
  if (existing?.__trojan) { if (demo && (state.mode !== 'demo' || !state.audit)) { state.open = true; if (state.mode !== 'demo') setMode('demo', { quiet: true }); else loadSample(); } existing.__trojan.open(); return existing.__trojan; }
  existing?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-shell', shell);
  const root = host.attachShadow({ mode: 'open' });
  const css = await (await fetch(new URL('./panel.css', import.meta.url))).text();
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  try { // @font-face does not work inside a shadow root, so register the font on the document from bytes.
    const bytes = await (await fetch(new URL('./vendor/dm-sans.woff2', import.meta.url))).arrayBuffer();
    const face = new FontFace('TP DM Sans', bytes, { weight: '100 1000' });
    await face.load();
    document.fonts.add(face);
  } catch { /* system font fallback */ }

  const mark = h('img', { class: 'mark', alt: '', width: '30', height: '30', src: LOGO_URL });
  const wrap = h('div', { class: 'tp' });
  const launcher = h('button', { class: 'launcher', type: 'button', 'aria-label': 'Open TroyPlan', 'data-fk': 'launcher', onclick: open }, mark.cloneNode(true), 'TroyPlan');
  const head = h('header', { class: 'head' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'TroyPlan sections' });
  const progress = h('div', { id: 'tp-view-progress', role: 'tabpanel', 'aria-labelledby': 'tp-tab-progress', class: 'view' });
  const four = h('div', { id: 'tp-view-four', role: 'tabpanel', 'aria-labelledby': 'tp-tab-four', class: 'view' });
  const plan = h('div', { id: 'tp-view-plan', role: 'tabpanel', 'aria-labelledby': 'tp-tab-plan', class: 'view' });
  const body = h('div', { class: 'body' }, progress, four, plan);
  const next = h('div', { class: 'next' });
  const toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  const panel = h('aside', { class: 'panel', role: shell === 'page' ? 'region' : 'dialog', 'aria-label': 'TroyPlan', onkeydown: event => { if (state.shell === 'drawer' && event.key === 'Escape') { event.stopPropagation(); close(); } } }, head, tabs, body, next, toast);
  wrap.append(launcher, panel);
  root.append(wrap);
  ui = { root, panel, launcher, head, tabs, body, progress, four, plan, next, toast, mark };
  host.__trojan = { open, close, toggle: () => (state.open ? close() : open()), loadSample };
  (container ?? document.documentElement ?? document.body).append(host);
  state = fresh();
  state.shell = shell;
  state.mode = demo || !onWebReg() ? 'demo' : 'live';
  if (onCourseBin()) state.view = 'plan';
  if (shell === 'page') {
    const fromHash = Object.entries(HASH).find(([, value]) => `#${value}` === location.hash)?.[0];
    if (fromHash) state.view = fromHash;
    addEventListener('hashchange', () => { const v = Object.entries(HASH).find(([, value]) => `#${value}` === location.hash)?.[0]; if (v && v !== state.view) { state.view = v; render(); } });
  }
  render();
  // WebReg may rebuild its page. Keep the planner attached without ever duplicating it.
  if (shell === 'drawer') new MutationObserver(() => { if (!host.isConnected && !document.getElementById(HOST_ID)) document.documentElement.append(host); })
    .observe(document.documentElement, { childList: true });
  if (demo || shell === 'page') { if (state.mode === 'demo') loadSample(); }
  if (demo && shell === 'drawer') open();
  return host.__trojan;
}
