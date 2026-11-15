// Reads the signed-in WebReg myCourseBin page into plain data, and builds a plan from those real sections.
// Read-only: nothing here clicks, submits, or changes the page. Parsing is based on the page's own markup
// (div#courseBin_<DEPT>-<NUM> containing div#section_<number> rows with fixed columns).
const DAY_INDEX = { M: 0, T: 1, W: 2, Th: 3, F: 4, S: 5, U: 6 };

export function parseDays(text) {
  const out = [];
  const compact = String(text ?? '').replace(/[\s,/]/g, '');
  if (!/^(?:Th|Tu|M|T|W|F|S|U)+$/.test(compact)) return out; // "TBA", "Online" and the like have no days
  for (const match of compact.matchAll(/Th|Tu|M|T|W|F|S|U/g)) {
    const key = match[0] === 'Tu' ? 'T' : match[0];
    if (!out.includes(DAY_INDEX[key])) out.push(DAY_INDEX[key]);
  }
  return out.sort((a, b) => a - b);
}

// "10:00am-11:50am", "11:00-12:20pm". Returns { start, end } in minutes, or null for TBA or anything unrecognized.
export function parseTimeRange(text) {
  const match = /(\d{1,2}):(\d{2})\s*([ap]m)?\s*-\s*(\d{1,2}):(\d{2})\s*([ap]m)/i.exec(String(text ?? ''));
  if (!match) return null;
  const to = (h, m, ap) => (Number(h) % 12 + (/p/i.test(ap) ? 12 : 0)) * 60 + Number(m);
  const end = to(match[4], match[5], match[6]);
  let start = to(match[1], match[2], match[3] ?? match[6]);
  if (!match[3] && start > end) start -= 720; // "11:00-12:20pm" means 11 AM
  return start >= 0 && end > start ? { start, end } : null;
}

const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

// Text of one column, without the mobile-only labels and without the action buttons.
function cellText(span) {
  if (!span) return '';
  const copy = span.cloneNode(true);
  for (const el of copy.querySelectorAll('.hidden-lg, .hidden-md, .visible-xs-\\*, .actionbar')) el.remove();
  for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
  return copy.textContent;
}

// WebReg labels every column (for narrow screens) with a hidden span such as "Time:". Reading the labels lets one parser
// handle both myCourseBin (has an Action column) and department course lists (does not). Fallback is the myCourseBin order.
const FALLBACK = ['action', 'section', 'session', 'type', 'units', 'registered', 'time', 'days', 'instructor', 'location'];
function columns(sec) {
  const spans = [...sec.querySelectorAll('.section_crsbin > span.section_row, :scope > div > span.section_row')]
    .filter((span, i, all) => all.indexOf(span) === i);
  const labelOf = span => clean(span.querySelector(':scope > .hidden-lg, :scope > .hidden-md')?.textContent).replace(/:$/, '').toLowerCase();
  const labels = spans.map(labelOf);
  const known = new Set(['action', 'section', 'session', 'type', 'units', 'registered', 'time', 'days', 'instructor', 'location', 'prof. rating', 'grade option']);
  const byLabel = labels.some(label => known.has(label));
  const map = {};
  spans.forEach((span, i) => { const key = byLabel ? labels[i] : FALLBACK[i]; if (key && !(key in map)) map[key] = span; });
  return { spans, map, byLabel };
}

export function parseSection(sec) {
  const { map } = columns(sec);
  const lines = key => cellText(map[key]).split('\n').map(clean).filter(Boolean);
  const number = (sec.id.match(/^section_(\d{5})$/) ?? [])[1];
  const typeClass = [...(map.type?.classList ?? [])].find(c => c.startsWith('course-section-'));
  const type = clean(cellText(map.type)) || (typeClass ? typeClass.replace('course-section-', '').replace(/^./, c => c.toUpperCase()) : 'Section');
  const times = lines('time'), days = lines('days');
  const meetings = times.map((time, i) => ({ range: parseTimeRange(time), days: parseDays(days[i] ?? days.at(-1) ?? '') }))
    .filter(m => m.range && m.days.length).map(m => ({ days: m.days, start: m.range.start, end: m.range.end }));
  const seats = /(\d+)\s+of\s+(\d+)/.exec(clean(cellText(map.registered)));
  const status = [...sec.querySelectorAll('.dvSRtxt')].find(el => getComputedStyle(el).display !== 'none')?.textContent ?? '';
  const instructor = lines('instructor').join('; ');
  return {
    id: number, suffix: (/\b([A-Z])\s*$/.exec(clean(map.section?.querySelector('b')?.textContent ?? cellText(map.section)))?.[1]) ?? '', mode: type,
    units: Number.parseFloat(cellText(map.units)) || 0,
    registered: seats ? Number(seats[1]) : null, capacity: seats ? Number(seats[2]) : null,
    seats: seats ? Math.max(0, Number(seats[2]) - Number(seats[1])) : null,
    instructors: instructor ? [instructor] : [], location: clean(cellText(map.location)),
    meetings, hasTime: meetings.length > 0,
    isRegistered: /Registered/.test(status) && !/Not Registered/.test(status),
    isScheduled: /Scheduled/.test(status) && !/Not Scheduled/.test(status),
    clearance: false,
  };
}

// Course blocks (div#courseBin_<DEPT>-<NUM>) appear on myCourseBin and on department course lists. The heading
// reads like "HIST-101 gp:". The letters after the code are WebReg's course flags; a "g" marks a general education
// course, but WebReg does not say which GE category (A to H) it satisfies.
function readBlocks(root, scope) {
  const courses = [];
  for (const block of root.querySelectorAll(`${scope} div[id^="courseBin_"]`)) {
    const id = block.id.replace('courseBin_', '');
    const heading = root.querySelector(`a.course-title-indent[href="#${block.id}"]`);
    const sections = [...block.querySelectorAll('div.section[id^="section_"]')].map(parseSection).filter(s => s.id);
    if (!sections.length) continue;
    const flags = (/^[A-Z]{2,5}-\d{3}[A-Z]?\s*([a-z]*)/.exec(clean(heading?.querySelector('.crsID')?.textContent)) ?? [])[1] ?? '';
    courses.push({
      id, name: clean(heading?.querySelector('.crsTitl')?.textContent) || id, flags, geFlag: flags.includes('g'),
      units: Math.max(0, ...sections.filter(s => /lecture/i.test(s.mode)).map(s => s.units), ...sections.map(s => s.units).slice(0, 1)),
      sections,
    });
  }
  return { courses, found: courses.length > 0 };
}

export const readCourseBin = (root = document) => readBlocks(root, '#mycbdiv');
export const readCourseList = (root = document) => readBlocks(root, 'body');
