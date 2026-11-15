// A fictional myCourseBin page that mirrors the structure of the real WebReg page (classes, column order, hidden
// status elements, action links). All classes, people and numbers are invented. Click traps record any click.
const row = ({ id, suffix, type, units, seats, time, days, who, status, registered }) => `
<div class="section" id="section_${id}"><div class="col-xs-12"><div class="section_crsbin blank_rating">
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Action</span><div class="schUnschRmv" id="section-action">
   <div class="btn-group actionbar" id="schedN_regN_${id}"><a class="btn btn-default ajax-link" href="/CourseBin?Length=1">Schedule</a><a class="btn btn-default ajax-link" href="/CourseBin?Length=2">${registered ? 'Drop' : 'Remove'}</a></div></div></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Section</span><b>${id} ${suffix}</b></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Session</span><a class="sessLnk" href="#">001</a></span>
 <span class="course-section-${type.toLowerCase()} section_row"><span class="hidden-lg hidden-md visible-xs-*">Type</span>${type}</span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Units</span>${units}</span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Registered</span><span>${seats}</span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Time</span><span>${time}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Days</span><span>${days}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Instructor</span><span>${who}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Location</span><span>MOCK101<br></span></span>
 <div class="dvSRtxt" id="status_${id}"><span class="spSRtxt"><b>${status}</b></span></div>
 <div class="dvSRtxt" id="hidden_${id}" style="display:none"><span class="spSRtxt"><b>This section is Not Scheduled and Not Registered</b></span></div>
</div></div></div>`;
const course = (id, title, sections) => `
<div class="col-xs-12"><div class="col-xs-12"><a class="course-title-indent" href="#courseBin_${id}"><span class="crsID">${id}:</span><span class="crsTitl">${title}</span></a></div>
<div class="col-xs-12" id="courseBin_${id}"><div class="bs-callout bs-callout-default"><span>Invented description.</span></div>${sections.join('')}</div></div>`;
const NOT = 'This section is Not Scheduled and Not Registered';
export const MOCK_SECTION_COUNT = 7;
export const coursebinHtml = () => `<!doctype html><html><head><meta charset="utf-8"><title>WebReg: Message (fictional mock)</title></head>
<body class="coursebin-page"><div id="sb-site"><div class="msgCrsbinStat"><span class="mycbstat">Registered section: 2</span></div>
<div id="mycbdiv" class="content-wrapper-coursebin">
${course('AAA-101', 'Intro to Fictional Studies', [
  row({ id: '10001', suffix: 'D', type: 'Lecture', units: '4.0', seats: '3 of 30', time: '08:00am-09:50am', days: 'MW', who: 'Example, Alex', status: NOT }),
  row({ id: '10002', suffix: 'D', type: 'Lecture', units: '4.0', seats: '29 of 30', time: '01:00pm-02:50pm', days: 'MW', who: 'Sample, Sam', status: NOT }),
  row({ id: '10003', suffix: 'R', type: 'Discussion', units: '0.0', seats: '5 of 30', time: '03:00pm-03:50pm', days: 'T', who: '', status: NOT }),
])}
${course('BBB-202', 'Mock Methods', [
  row({ id: '20001', suffix: 'D', type: 'Lecture', units: '4.0', seats: '10 of 40', time: '10:00am-11:50am', days: 'TTh', who: 'Placeholder, Pat', status: 'This section is Registered with grade option of Letter Grade', registered: true }),
])}
${course('CCC-303', 'Imaginary Topics', [
  row({ id: '30001', suffix: 'D', type: 'Lecture', units: '4.0', seats: '1 of 25', time: '12:00pm-01:50pm', days: 'TTh', who: 'Demo, Dana', status: NOT }),
  row({ id: '30002', suffix: 'D', type: 'Lecture', units: '4.0', seats: '8 of 25', time: '04:00pm-05:50pm', days: 'MW', who: 'Demo, Dana', status: NOT }),
])}
</div></div>
<script>window.__clicks = []; document.addEventListener('click', e => { if (e.target.id === 'trojan-planner-host') return; window.__clicks.push((e.target.closest('a,button,input') || e.target).outerHTML.slice(0, 60)); }, true);</script>
</body></html>`;

// Fictional department course list. Same markup family as myCourseBin but with no Action column, and the course
// heading carries WebReg's course flags (a "g" marks a general education course; it does not say which category).
const listRow = ({ id, suffix, type, units, seats, time, days, who }) => `
<div class="section" id="section_${id}"><div class="col-xs-12"><div class="section_crsbin">
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Section:</span><b>${id} ${suffix}</b></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Session:</span><a class="sessLnk" href="#">001</a></span>
 <span class="course-section-${type.toLowerCase()} section_row"><span class="hidden-lg hidden-md visible-xs-*">Type:</span>${type}</span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Units:</span>${units}</span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Registered:</span><span>${seats}</span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Time:</span><span>${time}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Days:</span><span>${days}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Instructor:</span><span>${who}<br></span></span>
 <span class="section_row"><span class="hidden-lg hidden-md visible-xs-*">Location:</span><span>MOCK202<br></span></span>
</div></div></div>`;
const listCourse = (id, flags, title, sections) => `
<div class="col-xs-12"><div class="col-xs-12"><a class="course-title-indent" href="#courseBin_${id}"><span class="crsID">${id} ${flags}:</span><span class="crsTitl">${title}</span></a></div>
<div class="col-xs-12" id="courseBin_${id}"><div class="bs-callout bs-callout-default"><span>Invented description.</span></div>${sections.join('')}</div></div>`;
export const coursesListHtml = () => `<!doctype html><html><head><meta charset="utf-8"><title>WebReg: Courses (fictional mock)</title></head>
<body class="courses-page"><div id="sb-site">
${listCourse('QQQ-110', 'g', 'Invented GE Course One', [
  listRow({ id: '50001', suffix: 'D', type: 'Lecture', units: '4.0', seats: '10 of 40', time: '10:00am-11:20am', days: 'TTh', who: 'Fiction, Fran' }),
  listRow({ id: '50002', suffix: 'R', type: 'Discussion', units: '0.0', seats: '2 of 20', time: '01:00pm-01:50pm', days: 'F', who: '' }),
])}
${listCourse('QQQ-120', 'gw', 'Invented GE Course Two', [
  listRow({ id: '50011', suffix: 'D', type: 'Lecture', units: '4.0', seats: '39 of 40', time: '02:00pm-03:20pm', days: 'MW', who: 'Made-Up, Max' }),
])}
${listCourse('QQQ-130', '', 'Invented Non-GE Course', [
  listRow({ id: '50021', suffix: 'D', type: 'Lecture', units: '4.0', seats: '5 of 40', time: '09:00am-10:20am', days: 'TTh', who: 'Nobody, Nina' }),
])}
</div>
<script>window.__clicks = []; document.addEventListener('click', e => { if (e.target.id === 'trojan-planner-host') return; window.__clicks.push((e.target.closest('a,button,input') || e.target).outerHTML.slice(0, 60)); }, true);</script>
</body></html>`;
