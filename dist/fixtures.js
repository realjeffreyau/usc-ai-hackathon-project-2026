// Fictional demo fixtures. Nothing here describes a real student, class section, or WebReg record.
// Exception: BME 201 section 29202 comes from the bundled public Spring 2027 schedule snapshot.
import { parseCourseBin } from './planner.js';
import { sample } from './sample.js';

const past = (label, status, rows) => ({ label, status, boxes: rows.map(([code, units, note = '']) => ({ code, units, note })) });

// Fictional earlier terms (real course codes from the Biomedical Engineering BS catalogue): 62 earned units, then 14 in progress, matching the sample audit totals.
const ROADMAP_PAST = [
  past('Fall 2024', 'done', [['CHEM 105A', 4], ['MATH 125', 4], ['WRIT 150', 4], ['GE A', 4]]),
  past('Spring 2025', 'done', [['MATH 126', 4, 'MATH 125'], ['PHYS 151L', 4, 'MATH 125'], ['CHEM 105B', 4, 'CHEM 105A'], ['GE D', 4]]),
  past('Fall 2025', 'done', [['MATH 226', 4, 'MATH 126'], ['PHYS 152L', 4, 'PHYS 151L'], ['BISC 220L', 4], ['BME 101', 4]]),
  past('Spring 2026', 'done', [['BME 202', 4], ['CHEM 322AL', 4], ['GE E', 4], ['BME 415', 2]]),
  past('Fall 2026', 'now', [['WRIT 340', 4, 'WRIT 150'], ['CHEM 322BL', 4, 'CHEM 322AL'], ['BME 302L', 4], ['GE F', 2]]),
];

const geRow = (title, status) => ({ title, status, children: [] });
// The fictional audit: the sample audit plus its general education rows. Unit totals are unchanged.
const DEMO_AUDIT = {
  ...sample,
  requirements: [
    ...sample.requirements,
    geRow('GE-A The Arts', 'complete'), geRow('GE-B Humanistic Inquiry', 'remaining'), geRow('GE-C Social Analysis', 'remaining'),
    geRow('GE-D Life Sciences', 'complete'), geRow('GE-E Physical Sciences', 'complete'), geRow('GE-F Quantitative Reasoning', 'complete'),
  ],
};

export const DEMO_PROFILE = { name: 'Sample student', detail: 'Biomedical Engineering, fictional profile', audit: DEMO_AUDIT, roadmap: ROADMAP_PAST };

// Demo rating scale. These numbers are invented placeholders derived from the name, NOT Rate My Professors data.
// They sit in a plausible 3.6 to 4.8 band so no real instructor is shown a harsh made-up score.
export function demoRating(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { score: Math.round((3.6 + (hash % 13) / 10) * 10) / 10, count: 20 + ((hash >>> 5) % 80) };
}

export const EXAMPLE_PROMPT = 'Prioritize prerequisites, stay under 16 units, and avoid classes before 10 am';

// One-click example requests shown under the prompt box.
export const EXAMPLES = [
  { label: 'Find a GE-B', text: 'Find me a GE-B with a highly rated professor, no classes before 10, and keep me at 16 units or less' },
  { label: 'No early classes', text: 'Avoid classes before 10 am' },
  { label: 'Lighter semester', text: 'A light semester, 12 units, nothing after 5 pm' },
];
export const GE_EXAMPLE = 'Find me a GE-B with a highly rated professor, no classes before 10, and keep me at 16 units or less';

// A made-up writing class the sample student already saved in myCourseBin. Its section number is not a real WebReg ID.
const writing = {
  id: 'SOCI-150', name: 'Introduction to Sociology (demo class)', units: 4, why: '', prereq: [], coreq: [],
  bundles: [[{ id: '99150', mode: 'Lecture', clearance: false, seats: null, instructors: [], meetings: [{ days: [0, 2], start: 960, end: 1040 }] }]],
  demo: true,
};

// Sample myCourseBin: one real snapshot class (BME 201, Wed 12:00 PM) that overlaps the default MATH 245 lecture
// (Mon/Wed/Fri 1:00 PM), so the conflict is deliberate, and MATH 245 has conflict-free alternatives.
export function demoBin() {
  const known = parseCourseBin('29202').existing;
  return { existing: [...known, { course: writing, sections: writing.bundles[0] }], unknown: [], demo: true };
}
