"""Create a curated snapshot from public Spring 2027 Schedule of Classes records."""
import json
from pathlib import Path
from urllib.request import Request, urlopen
import sys

BASE = 'https://classes.usc.edu/api/Courses/Course?termCode=20271&courseCode='
BUNDLES = {
    'MATH-245': [['39601','39603'], ['39605','39606'], ['39609','39610'], ['39609','39611']],
    'BME-210': [['29200','29211'], ['29200','29212']],
    'EE-202': [['30427','30429']],
    'EE-109': [[lecture,'30530',lab] for lecture in ('31395','31291') for lab in ('30799','31292','31018')],
    'CHEM-105B': [[lecture,quiz,lab] for lecture,quiz in [('17256','17257'),('17258','17259'),('17260','17262')]
                  for lab in ('17293','17304')],
    'HBIO-301': [['38434',lab] for lab in ('38435','38436','38437','38440','38441')],
    'BME-201': [['29202']],
    'BME-445A': [['29206','29237']],
    'BME-445B': [['29231',lab] for lab in ('29232','29234','29236')],
}
REASONS = {
    'MATH-245': 'Engineering math. Can fulfill the corequisite for BME 210 and EE 202 in the same term.',
    'BME-210': 'Biomedical engineering core. Completing it unlocks the BME 445A prerequisite.',
    'EE-202': 'Circuits requirement. Can fulfill a corequisite for BME 445A.',
    'EE-109': 'Embedded systems course for the electronics path.',
    'CHEM-105B': 'Chemistry sequence. Check how it applies to your degree or pre-health plan.',
    'HBIO-301': 'A biology option in the published BME curriculum.',
    'BME-201': 'A technical elective option in the published BME curriculum.',
    'BME-445A': 'First senior design course. It is a prerequisite for BME 445B.',
    'BME-445B': 'Second senior design course. It follows BME 445A.',
}
DAYS={day:i for i,day in enumerate(('Mon','Tue','Wed','Thu','Fri','Sat','Sun'))}

def mins(value):
    hour, minute = map(int,value.split(':'))
    return hour*60+minute

def rule(data,key):
    return [{'count': group['requiredCourses'], 'options':[
        [c['courseHyphen'], *(concurrent['courseHyphen'] for concurrent in c.get('ands',[]))]
        for c in group['courseOptions']]} for group in data[key] or []]

def project(item):
    total=item['totalSeats']
    used=item['registeredSeats']
    return dict(id=item['sisSectionId'], mode=item['rnrMode'], clearance=item['hasDClearance'],
        seats=max(0,total-used) if total is not None and used is not None else None,
        instructors=[' '.join(filter(None,(person['firstName'],person['lastName']))) for person in item['instructors'] or []],
        meetings=[dict(days=[DAYS[day] for day in m['days']],start=mins(m['startTime']),end=mins(m['endTime']))
            for m in item['schedule'] if m['days'] and ':' in m['startTime'] and ':' in m['endTime']])

def read_course(code, cache):
    if cache:
        return json.loads((cache/(code+'.json')).read_text())
    request=Request(BASE+code.replace('-',''),headers={'Accept':'application/json'})
    with urlopen(request,timeout=20) as response:
        return json.load(response)

def main():
    cache=Path(sys.argv[1]) if len(sys.argv)==2 else None
    result=[]
    for code,bundles in BUNDLES.items():
        data=read_course(code,cache)
        assert data['termCode']==20271 and data['scheduledCourseCode']['courseHyphen']==code,code
        sections={s['sisSectionId']:s for s in data['sections'] if not s['isCancelled']}
        result.append(dict(id=code,name=data['name'].strip(),units=data['courseUnits'][0],why=REASONS[code],
            prereq=rule(data,'prerequisiteCourseCodes'),coreq=rule(data,'corequisiteCourseCodes'),
            bundles=[[project(sections[section]) for section in bundle] for bundle in bundles]))
    output=Path(__file__).resolve().parents[1]/'dist'/'catalog.js'
    output.write_text('// Selected public USC sections, Spring 2027.\nexport const courses = '+json.dumps(result,indent=2)+';\n')

if __name__=='__main__':
    main()
