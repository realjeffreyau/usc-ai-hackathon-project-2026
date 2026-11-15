const statuses = { NO:'remaining', OK:'complete', IP:'progress', 'IP+':'progress', '+':'complete', '-':'remaining' };
const labels = /^(?:NO|OK|IP)\s*=|^REQUIREMENT\s+(?:FLAGS|LEGEND|STATUS)\s*:|^\*{3,}\s*LEGEND\s*\*{3,}/i;
export function parseAudit(raw) {
  if (typeof raw !== 'string' || raw.length > 400000) throw new Error('Use a STARS export under 400,000 characters.');
  const requirements = [];
  const completed = new Set();
  const suggested = new Set();
  let parent, current;
  const lines = raw.replace(/[\u200b\ufeff]/g,'').replace(/[\u2010-\u2015]/g,'-').split(/\r?\n|\f/);
  for (const source of lines) {
    const line = source.trim();
    if (labels.test(line)) break;
    const sub = line.match(/^(IP\+?|\+|-)(?:\s*R)?\s+\d{1,2}\)\s*([A-Z0-9][^=]{3,150})$/i);
    const entry = sub || line.match(/^(NO|OK|IP\+?)\s+([A-Z0-9][^=]{5,165})$/);
    if (entry) {
      const title = entry[2].split(/\s{3,}/)[0].trim().replace(/[:.]$/, '');
      current = {title, status:statuses[entry[1].toUpperCase()], children:[]};
      if (sub && parent) parent.children.push(current);
      else { parent=current; requirements.push(current); }
      continue;
    }
    if (!current) continue;
    const course = line.match(/^\d{5}\s+([A-Z]{2,5})\s*(\d{3}[A-Z]?)\b.{0,30}?\s(\d{1,2}(?:\.\d{1,2})?)\s+([ABC][+-]?|CR|P)\b/i);
    if (course && Number(course[3])>0) completed.add(course[1].toUpperCase()+'-'+course[2].toUpperCase());
    const options = line.match(/^SELECT FROM:\s*(.+)$/i);
    if (options && current.status==='remaining') {
      for (const match of options[1].matchAll(/\b([A-Z]{2,5})\s*-?\s*(\d{3}[A-Z]?)\b/g)) suggested.add(match[1]+'-'+match[2]);
    }
    const earned = line.match(/^EARNED:\s*(\d{1,3}(?:\.\d{1,2})?)\s+UNITS?\b|^(\d{1,3}(?:\.\d{1,2})?)\s+UNITS?\s+EARNED\b/i);
    const progress = line.match(/^(?:IN[- ]PROCESS|IN[- ]PROGRESS|IN-P|IP)\s*(?::|-+>)\s*(\d{1,3}(?:\.\d{1,2})?)\s+UNITS?\b/i);
    const needs = line.match(/^(?:-+>\s*)?NEEDS:\s*(.+)$/i);
    if (earned) current.earned ??= Number(earned[1] ?? earned[2]);
    if (progress) current.progress ??= Number(progress[1]);
    if (needs) {
      const units = needs[1].match(/\b(\d{1,3}(?:\.\d{1,2})?)\s+UNITS?\b/i);
      const courses = needs[1].match(/\b(\d{1,2})\s+COURSES?\b/i);
      if (units) current.remaining ??= Number(units[1]);
      if (courses) current.courseCount ??= Number(courses[1]);
    }
  }
  if (!requirements.length) throw new Error('No STARS requirement rows found. Try a text-based report with NO, OK and IP labels.');
  const overall = requirements.find(row => /\bMINIMUM\b.*\b1\d\d\s+UNITS\b/i.test(row.title) && row.earned!=null);
  return {
    requirements: requirements.slice(0,100), completed:[...completed], suggested:[...suggested],
    total: overall ? Number(overall.title.match(/\b(1\d\d)\s+UNITS\b/i)[1]) : null,
    earned:overall?.earned, progress:overall?.progress, remaining:overall?.remaining,
  };
}

function extractLines(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [, , , , x, y] = item.transform;
    let row = rows.find(entry => Math.abs(entry.y-y)<=1.5);
    if (!row) { row={y, columns:[]}; rows.push(row); }
    row.columns.push({ x, width:item.width, text:item.str });
  }
  return rows.sort((a,b)=>b.y-a.y).map(({columns})=>{
    let end=0;
    return columns.sort((a,b)=>a.x-b.x).map(({x,width,text},i)=>{
      const gap=x-end;
      end=x+width;
      return (i ? gap<0.8?'':gap<12?' ':gap<28?'  ':'   ' : '') + text;
    }).join('');
  }).join('\n');
}

export async function readAuditPdf(file) {
  if (!file || !/\.pdf$/i.test(file.name) || !file.size || file.size>5*1024*1024) {
    throw new Error('Choose a text-based PDF no larger than 5 MB.');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.subarray(0,5))!=='%PDF-') throw new Error('The selected file could not be read as a PDF.');
  const pdf = await import('./vendor/pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
  const task=pdf.getDocument({data, isEvalSupported:false, enableScripting:false, enableXfa:false, useWorkerFetch:false,
    useWasm:false, disableFontFace:true, useSystemFonts:false, stopAtErrors:true});
  task.onPassword=()=>{ void task.destroy().catch(()=>{}); };
  let timeout;
  try {
    const extract=async()=>{
      const doc=await task.promise;
      if (doc.numPages>24) throw new Error('Choose a PDF with 24 pages or fewer.');
      const pages=[];
      for (let n=1; n<=doc.numPages; n+=1) {
        const page=await doc.getPage(n);
        pages.push(extractLines((await page.getTextContent()).items));
        page.cleanup();
      }
      return parseAudit(pages.join('\n'));
    };
    return await Promise.race([extract(), new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(new Error('Reading this PDF took too long. Try pasting its text.')),12000);
    })]);
  } catch (error) {
    if (/^(Choose a PDF|No STARS|Use a STARS|Reading this PDF)/.test(error.message)) throw error;
    throw new Error('This PDF could not be read. Try pasting the text from an unlocked STARS report.');
  } finally { clearTimeout(timeout); await task.destroy().catch(()=>{}); }
}
