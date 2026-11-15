// Fictional GE sample data for the demo. Course names, instructors, ratings, section numbers and seat counts are invented.
// Section numbers use the 98xxx range, which is not used by real USC sections. Ratings are labeled "Sample rating" in the UI.
// No data here was scraped or copied from Rate My Professors or USC.
const meet = (days, start, end) => ({ days, start, end });
const sec = (id, mode, meetings, instructors, seats, clearance = false) => ({ id, mode, clearance, seats, instructors, meetings });
const t = (h, m = 0) => h * 60 + m;
const MW = [0, 2], TTH = [1, 3], MWF = [0, 2, 4], FRI = [4];

export const SAMPLE_RATINGS = {
  'Ellis Marlowe': { rating: 4.8, count: 52 },
  'Lena Okafor': { rating: 4.7, count: 40 },
  'Priya Danvers': { rating: 4.5, count: 31 },
  'Marcus Bell': { rating: 4.9, count: 12 },
  'Rosa Beaumont': { rating: 4.3, count: 34 },
  'Dev Ashworth': { rating: 4.4, count: 23 },
  'Tomás Whitfield': { rating: 5.0, count: 1 },
  'Jonah Pryce': { rating: 4.9, count: 61 },
  'Ingrid Solano': { rating: 4.6, count: 28 },
  'Amara Lindqvist': { rating: 4.6, count: 45 },
  'Kofi Mercer': { rating: 4.8, count: 66 },
  'Hana Ito': { rating: 4.2, count: 9 },
  // Noor Castellan intentionally has no rating, to show how missing ratings are handled.
};

export const GE_COURSES = [
  { id: 'HMNT-215', name: 'Stories That Shaped Cities', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98215', 'Lecture', [meet(MW, t(16, 30), t(17, 45))], ['Ellis Marlowe'], 14)],
    [sec('98216', 'Lecture', [meet(TTH, t(13), t(14, 20))], ['Priya Danvers'], 9)] ] },
  { id: 'HMNT-120', name: 'Ethics of Everyday Technology', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98120', 'Lecture', [meet(TTH, t(10), t(11, 20))], ['Tomás Whitfield'], 22), sec('98121', 'Discussion', [meet(FRI, t(10), t(10, 50))], [], 11)],
    [sec('98120', 'Lecture', [meet(TTH, t(10), t(11, 20))], ['Tomás Whitfield'], 22), sec('98122', 'Discussion', [meet(FRI, t(15), t(15, 50))], [], 8)] ] },
  { id: 'HMNT-140', name: 'Mythology in Modern Media', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98140', 'Lecture', [meet(MWF, t(11), t(11, 50))], ['Noor Castellan'], 18)] ] },
  { id: 'HMNT-160', name: 'Philosophy of Mind and Machines', units: 4, ge: ['GE-B'], prereq: [{ count: 1, options: [['PHIL-100']] }], coreq: [],
    verify: 'Equivalent AP or transfer credit may also count. Check with your advisor.', bundles: [
    [sec('98160', 'Lecture', [meet(TTH, t(11), t(12, 20))], ['Jonah Pryce'], 6)] ] },
  { id: 'HMNT-180', name: 'Cinema and Memory', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98180', 'Lecture', [meet(TTH, t(8), t(9, 20))], ['Ingrid Solano'], 20)],
    [sec('98181', 'Lecture', [meet(TTH, t(9), t(10, 20))], ['Ingrid Solano'], 12)] ] },
  { id: 'HMNT-200', name: 'Language, Power, and Identity', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98200', 'Lecture', [meet(MW, t(13), t(14, 20))], ['Lena Okafor'], 5, true)] ] },
  { id: 'HMNT-230', name: 'The Art of Argument', units: 4, ge: ['GE-B'], prereq: [], coreq: [], bundles: [
    [sec('98230', 'Lecture', [meet(TTH, t(14), t(15, 20))], ['Dev Ashworth'], 16), sec('98231', 'Discussion', [meet([3], t(16, 30), t(17, 20))], [], 10)],
    [sec('98230', 'Lecture', [meet(TTH, t(14), t(15, 20))], ['Dev Ashworth'], 16), sec('98232', 'Discussion', [meet(FRI, t(13), t(13, 50))], [], 7)] ] },
  { id: 'HMNT-250', name: 'Media and Society', units: 4, ge: ['GE-B', 'GE-C'], prereq: [], coreq: [], bundles: [
    [sec('98250', 'Lecture', [meet(TTH, t(11, 30), t(12, 50))], ['Rosa Beaumont'], 25)] ] },
  { id: 'HMNT-260', name: 'Seminar in Public Memory', units: 4, ge: ['GE-B'], prereq: [], coreq: [],
    verify: 'The listing mentions instructor approval for non-majors. Confirm in WebReg.', bundles: [
    [sec('98260', 'Lecture', [meet(FRI, t(10), t(12, 50))], ['Marcus Bell'], 0)] ] },
  { id: 'SOCA-110', name: 'Social Networks and Society', units: 4, ge: ['GE-C'], prereq: [], coreq: [], bundles: [
    [sec('98110', 'Lecture', [meet(MW, t(14), t(15, 20))], ['Amara Lindqvist'], 12)] ] },
  { id: 'SOCA-135', name: 'Introduction to Behavioral Economics', units: 4, ge: ['GE-C'], prereq: [], coreq: [], bundles: [
    [sec('98135', 'Lecture', [meet(TTH, t(9, 30), t(10, 50))], ['Kofi Mercer'], 30)],
    [sec('98136', 'Lecture', [meet(TTH, t(12), t(13, 20))], ['Hana Ito'], 17)] ] },
];

// Fictional classes the sample student is already registered for this term (8 units).
const registered = (id, name, units, section) => ({ course: { id, name, units, prereq: [], coreq: [], why: '', bundles: [[section]], demo: true }, sections: [section] });
export const DEMO_REGISTERED = [
  registered('BISC-121', 'Sample registered class', 4, sec('98001', 'Lecture', [meet(MWF, t(8), t(8, 50))], [], null)),
  registered('ENGR-150', 'Sample registered class', 4, sec('98003', 'Lecture', [meet(TTH, t(16), t(17, 20))], [], null)),
];
