import { courses } from './catalog.js';

const training = {
  sequence: ['prioritize courses that unlock prerequisites','take prerequisite classes first',
    'prioritize prerequisite classes','focus on courses that unlock later classes','avoid delaying my degree',
    'unlock prerequisites','prioritize graduation requirements','keep my degree on track','get ahead of a bottleneck',
    'put required courses first','focus on degree progress','focus on a course sequence','unlock future classes'],
  mornings: ['avoid morning classes','no classes before ten','I want to start later',
    'avoid early classes','no early mornings','nothing before 10 am','mornings are hard',
    'start after 10','avoid 8 am classes','I work in the morning','prefer afternoon sections','afternoon only'],
  light: ['give me a lighter semester','I want a light load','keep it manageable','lighter load',
    'fewer units','take fewer courses','manageable workload','less stressful semester',
    'keep the workload low','a part time schedule','lighten my course load','I need more free time'],
};

function terms(text) {
  const words=(text.toLowerCase().match(/[a-z]+|\d+/g)??[]).map(word=>word==='prerequisites'?'prerequisite':word);
  return [...new Set(words.flatMap((word,i)=>i?[word,words[i-1]+' '+word]:[word]))];
}

// Multinomial Naive Bayes with Laplace smoothing, trained on the synthetic phrases above.
const vocabulary=new Set(Object.values(training).flatMap(list=>list.flatMap(terms)));
const models=Object.fromEntries(Object.entries(training).map(([label,phrases])=>{
  const values=phrases.flatMap(terms);
  const counts=new Map();
  for (const value of values) counts.set(value,(counts.get(value)??0)+1);
  return [label,{counts,total:values.length}];
}));

const clauseBreak=/[,;.]|\band\b|\bbut\b/;
export function interpretGoal(goal='') {
  const clean=goal.toLowerCase().slice(0,220);
  const clauses=clean.split(clauseBreak).filter(Boolean);
  const scores=Object.fromEntries(Object.entries(models).map(([label,{counts,total}])=>{
    const signals=clauses.map(clause=>terms(clause).filter(word=>vocabulary.has(word)).reduce((sum,word)=>
      sum+Math.log((1+(counts.get(word)??0))*vocabulary.size/(total+vocabulary.size)),0));
    return [label,Math.max(0,...signals)];
  }));
  const requestedUnits=clean.match(/\b(\d{1,2})\s*(?:units?|credits?)\b/);
  const requestedTime=clean.match(/\b(before|after)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?(?!\d)/);
  let morning=scores.mornings>1.3?600:0;
  let latest;
  if (requestedTime && Number(requestedTime[2])>=1 && Number(requestedTime[2])<=12) {
    const [,direction,hourText,minutes,period]=requestedTime;
    const hour=Number(hourText);
    const hours=period?.startsWith('p')?hour%12+12:(!period&&hour===12?12:hour%12);
    const value=hours*60+Number(minutes??0);
    const prefix=clean.slice(0,requestedTime.index).split(clauseBreak).at(-1);
    const avoid=/\b(?:avoid|no|not|nothing)\b/.test(prefix);
    if ((direction==='after')!==avoid) morning=value;
    else { morning=0; latest=value; }
  }
  const sequence=scores.sequence>1.3;
  const light=scores.light>1.3;
  return {units:requestedUnits?Math.max(2,Math.min(20,Number(requestedUnits[1]))):light?12:16,
    morning,latest,sequence,understood:Boolean(requestedUnits||morning||latest||sequence||light)};
}

export const courseName=code=>code.replace('-',' ');
export const prereqCodes=[...new Set(courses.flatMap(({prereq,coreq})=>
  [...prereq,...coreq].flatMap(group=>group.options.flat())))].sort();
export const meets=(groups,codes)=>groups.every(({count,options})=>
  options.filter(option=>option.every(code=>codes.has(code))).length>=count);
const overlaps=(a,b)=>a.start<b.end && b.start<a.end && a.days.some(day=>b.days.includes(day));
export const totalUnits=items=>items.reduce((sum,item)=>sum+item.course.units,0);

export function conflictsFor(items) {
  const meetings=items.flatMap(({course,sections})=>sections.flatMap(section=>section.meetings.map(
    meeting=>({...meeting,course:course.id,section:section.id}))));
  const conflicts=[];
  meetings.forEach((a,i)=>{
    for (const b of meetings.slice(i+1)) if (a.section!==b.section && overlaps(a,b)) conflicts.push([a,b]);
  });
  return conflicts;
}

export function linkedCourses(code) {
  return courses.filter(({prereq,coreq})=>[...prereq,...coreq]
    .some(group=>group.options.some(option=>option.includes(code)))).map(course=>course.id);
}

const sectionIndex=new Map(courses.flatMap(course=>course.bundles.flat().map(section=>[section.id,{course,section}])));
export function parseCourseBin(text) {
  const tokens=text.toUpperCase().trim().split(/[\s,;]+/).filter(Boolean);
  if (tokens.some(value=>!/^\d{5}[DR]?$/.test(value))) throw new Error('Use five-digit section numbers separated by spaces or commas.');
  const grouped=new Map(), unknown=[];
  for (const id of new Set(tokens.map(value=>value.slice(0,5)))) {
    const match=sectionIndex.get(id);
    if (!match) {unknown.push(id); continue;}
    const existing=grouped.get(match.course.id)??{course:match.course,sections:[]};
    existing.sections.push(match.section);
    grouped.set(match.course.id,existing);
  }
  return {existing:[...grouped.values()],unknown};
}

export function planSemester(completed,targets,preferences,existing=[]) {
  const binCodes=new Set(existing.map(({course})=>course.id));
  const fixedMeetings=existing.flatMap(({sections})=>sections.flatMap(section=>section.meetings));
  const eligible=courses.filter(course=>targets.has(course.id) && !completed.has(course.id)
    && !binCodes.has(course.id) && meets(course.prereq,completed));
  const weights={'MATH-245':15,'BME-210':14,'EE-202':12,'EE-109':11,'CHEM-105B':9,'HBIO-301':6};
  const entries=eligible.map(course=>{
    const weight=(weights[course.id]??8)+linkedCourses(course.id).length*(preferences.sequence?15:2);
    return {course,options:course.bundles.map((sections,index)=>{
      const meetings=sections.flatMap(section=>section.meetings);
      const outside=meetings.reduce((sum,meeting)=>sum+(Math.max(0,preferences.morning-meeting.start)
        +Math.max(0,meeting.end-(preferences.latest??1440)))*meeting.days.length,0);
      const closed=sections.some(section=>section.seats===0);
      return {course,sections,index,meetings,outside,score:weight-outside*0.12-(closed?30:0)};
    }).filter(option=> (!preferences.strict || option.outside===0) && !conflictsFor([option]).length && option.sections.every(section=>section.meetings.length)
      && !fixedMeetings.some(a=>option.meetings.some(b=>overlaps(a,b))))};
  });

  let best={score:-Infinity, chosen:[]};
  function choose(index,chosen,units,score) {
    if (index===entries.length) {
      const concurrent=new Set([...completed,...binCodes,...chosen.map(option=>option.course.id)]);
      if (chosen.every(option=>meets(option.course.coreq,concurrent)) && score+units*6>best.score) {
        best={score:score+units*6,chosen:[...chosen]};
      }
      return;
    }
    const {course,options}=entries[index];
    if (units+course.units<=preferences.units) {
      for (const option of options) {
        if (chosen.some(other=>other.meetings.some(a=>option.meetings.some(b=>overlaps(a,b))))) continue;
        chosen.push(option);
        choose(index+1,chosen,units+course.units,score+option.score);
        chosen.pop();
      }
    }
    choose(index+1,chosen,units,score);
  }
  choose(0,[],totalUnits(existing),0);
  return best.chosen;
}

export function graduationOutlook(units,load) {
  if (!Number.isFinite(units)||units<0||!Number.isFinite(load)||load<=0) return null;
  if (!units) return {term:null,semesters:0};
  const semesters=Math.ceil(units/load);
  const index=semesters-1;
  return {term:(index%2?'Fall ':'Spring ')+(2027+Math.floor(index/2)),semesters};
}
