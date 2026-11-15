// GE Finder logic. Pure and deterministic: no AI, no network. The AI (or the built-in rules) only turns a sentence into
// settings; eligibility, fit, unit cap, conflicts and ranking are the plain checks below.
import { DAYS, describeConflict, fmtDays, fmtMeeting, fmtTime, geCategoryOf, listConflicts } from './logic.js';
import { courseName, meets, totalUnits } from './planner.js';

export const GE_CATEGORIES = {
  'GE-A': 'The Arts', 'GE-B': 'Humanistic Inquiry', 'GE-C': 'Social Analysis', 'GE-D': 'Life Sciences',
  'GE-E': 'Physical Sciences', 'GE-F': 'Quantitative Reasoning', 'GE-G': 'Global Perspectives', 'GE-H': 'Global Perspectives',
};

export { geCategoryOf };

// Reads the GE-specific parts of a sentence. Units and times come from the shared preference reader.
export function parseGEGoal(text) {
  const clean = String(text ?? '');
  return {
    category: geCategoryOf(clean),
    highlyRated: /\b(highly|top|best|great|good|well)[-\s]?(rated|professors?|instructors?)\b|\b(great|good|best|top)\s+(professor|prof|instructor|teacher)/i.test(clean),
  };
}

// Review-count-aware score: pulls small samples toward the average so one 5.0 cannot beat dozens of 4.8s.
export const PRIOR = { mean: 3.9, weight: 8 };
export const adjustedRating = ({ rating, count }) => (count * rating + PRIOR.weight * PRIOR.mean) / (count + PRIOR.weight);

const ADD_ORDER = { yes: 0, check: 1, clearance: 2, waitlist: 3 };
const seatsText = n => `${n} seat${n === 1 ? '' : 's'} open`;
const daySummary = meetings => [...new Set(meetings.map(m => fmtDays(m.days)))].join(', ');
const outside = (meetings, prefs) => meetings.filter(m => (prefs.morning > 0 && m.start < prefs.morning) || (prefs.latest != null && m.end > prefs.latest));

// schedule: [{ course, sections }] already on the student's week (registered + planned). Returns viable sections ranked,
// the courses that do not work with the specific constraint and one action each, and a suggestion if nothing fits.
export function findGE({ category, courses, ratings = {}, schedule = [], prefs, completed = new Set(), source = 'Sample', ratingLabel = 'Sample rating', unratedNote = 'No rating found for this instructor.', scheduleKnown = true, allowSuggestion = true }) {
  const scheduleUnits = totalUnits(schedule);
  const viable = [], blocked = [];
  for (const course of courses.filter(c => c.ge.includes(category))) {
    if (completed.has(course.id)) { blocked.push({ course, reasons: [{ kind: 'done', text: 'You already completed this course.' }] }); continue; }
    const prereqOk = meets(course.prereq ?? [], completed);
    const unitsAfter = scheduleUnits + course.units;
    const evaluated = course.bundles.map((sections, index) => {
      const meetings = sections.flatMap(s => s.meetings);
      const ids = new Set(sections.map(s => s.id));
      const pairs = listConflicts([...schedule, { course, sections }]).filter(pair => pair.some(m => ids.has(m.section)));
      const external = pairs.filter(pair => pair.some(m => m.course !== course.id));
      const bad = outside(meetings, prefs);
      return { index, sections, meetings, external, internal: pairs.length - external.length, bad,
        failures: Number(!prereqOk) + Number(unitsAfter > prefs.units) + Number(bad.length > 0) + Number(external.length > 0) + Number(pairs.length > external.length) };
    });
    const good = evaluated.filter(b => b.failures === 0);
    if (!good.length) {
      const best = [...evaluated].sort((a, b) => a.failures - b.failures || a.index - b.index)[0];
      const reasons = [];
      if (!prereqOk) {
        const need = (course.prereq ?? []).flatMap(g => g.options.map(o => o.map(courseName).join(' + '))).join(' or ');
        reasons.push({ kind: 'prereq', text: `Needs ${need} first, and it is not in your audit.${course.verify ? ' ' + course.verify : ''}`, action: null });
      }
      if (unitsAfter > prefs.units) reasons.push({ kind: 'units', text: `Adding it makes ${unitsAfter} units, over your ${prefs.units}-unit limit.`, action: { label: `Raise the limit to ${unitsAfter} units`, patch: { units: unitsAfter } } });
      if (best.bad.length) {
        const earliest = Math.min(...course.bundles.flatMap(b => b.flatMap(s => s.meetings.map(m => m.start))));
        const latestEnd = Math.max(...course.bundles.flatMap(b => b.flatMap(s => s.meetings.map(m => m.end))));
        const early = prefs.morning > 0 && earliest < prefs.morning;
        const limit = early ? `starts before ${fmtTime(prefs.morning)}` : `ends after ${fmtTime(prefs.latest)}`;
        reasons.push({ kind: 'time', text: `Every section ${limit}. The closest option meets ${fmtMeeting(best.bad[0])}.`,
          action: early ? { label: `Allow classes from ${fmtTime(earliest)}`, patch: { morning: earliest } } : { label: `Allow classes until ${fmtTime(latestEnd)}`, patch: { latest: latestEnd } } });
      }
      if (best.external.length) reasons.push({ kind: 'conflict', text: `Overlaps your schedule: ${describeConflict(best.external[0])}.`, action: null });
      if (best.internal) reasons.push({ kind: 'bundle', text: 'Its required discussion or lab overlaps the lecture in every combination.', action: null });
      blocked.push({ course, reasons });
      continue;
    }
    const seen = new Set();
    for (const bundle of good) {
      const lecture = bundle.sections[0];
      if (seen.has(lecture.id)) continue; // keep the first viable discussion/lab for each lecture section
      seen.add(lecture.id);
      const name = lecture.instructors?.[0] ?? null;
      const rating = name ? ratings[name] ?? null : null;
      const sections = bundle.sections;
      const clearance = sections.some(s => s.clearance);
      const full = sections.find(s => s.seats === 0);
      const seatsOpen = sections.map(s => s.seats).filter(n => n != null);
      const canAdd = clearance ? { status: 'clearance', text: 'Needs department clearance. Request it in WebReg first.' }
        : full ? { status: 'waitlist', text: `Full (0 seats, ${source.toLowerCase()} seat count). You can join the waitlist in WebReg.` }
          : course.verify ? { status: 'check', text: course.verify }
            : { status: 'yes', text: seatsOpen.length ? `${seatsText(Math.min(...seatsOpen))} (${source.toLowerCase()} seat count)` : `Seats not reported (${source.toLowerCase()} data)` };
      const notes = [];
      if ((canAdd.status === 'check' || canAdd.status === 'clearance') && seatsOpen.length) notes.push(`${seatsText(Math.min(...seatsOpen))} (${source.toLowerCase()} seat count)`);
      if (clearance && course.verify) notes.push(course.verify);
      if (course.verify && canAdd.status !== 'check' && !notes.includes(course.verify)) notes.push(course.verify);
      if (!rating) notes.push(unratedNote);
      else if (rating.count < 5) notes.push(`Only ${rating.count} review${rating.count === 1 ? '' : 's'}, so treat the score as unreliable.`);
      const first = lecture.meetings[0];
      const days = first ? `${fmtDays(first.days)} ${fmtTime(first.start)}` : 'at a time to be announced';
      viable.push({
        key: `${course.id}:${bundle.index}`, course, index: bundle.index, sections, units: course.units, tags: course.ge,
        instructor: name, rating: rating ? { ...rating, adjusted: adjustedRating(rating), label: ratingLabel, few: rating.count < 5 } : null,
        canAdd, notes, days,
        explanation: scheduleKnown
          ? `Fulfills ${category}, meets ${days}, fits around your ${schedule.length} ${schedule.length === 1 ? 'class' : 'classes'}, and adds ${course.units} units (${unitsAfter} of ${prefs.units}).`
          : `Fulfills ${category}, meets ${days}, and adds ${course.units} units. Not checked against your registered classes: read myCourseBin first.`,
      });
    }
  }
  const byRating = prefs.ratingFirst !== false;
  viable.sort((a, b) => {
    if (byRating) {
      const ar = a.rating ? a.rating.adjusted : -1, br = b.rating ? b.rating.adjusted : -1;
      if (ar !== br) return br - ar;
    }
    return ADD_ORDER[a.canAdd.status] - ADD_ORDER[b.canAdd.status] || a.course.name.localeCompare(b.course.name);
  });

  let suggestion = null;
  if (!viable.length && allowSuggestion) {
    for (const entry of blocked) for (const reason of entry.reasons) {
      if (!reason.action || suggestion) continue;
      const tryPrefs = { ...prefs, ...reason.action.patch };
      const trial = findGE({ category, courses, ratings, schedule, prefs: tryPrefs, completed, source, ratingLabel, unratedNote, scheduleKnown, allowSuggestion: false });
      if (trial.viable.length) suggestion = { ...reason.action, wouldShow: trial.viable.length, course: entry.course };
    }
  }
  return { viable, blocked, suggestion, scheduleUnits, category };
}

export { DAYS };
