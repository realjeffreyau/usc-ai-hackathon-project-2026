// Builds a tiny text-based PDF from lines of text. Used only with fictional audit text.
export function makePdf(lines) {
  const esc = text => text.replace(/[\\()]/g, '\\$&');
  const content = ['BT', '/F1 9 Tf', '1 0 0 1 36 760 Tm', '11 TL', ...lines.map(line => `(${esc(line)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Entirely fictional audit text. FICTIONAL-MARKER-7F3A lets the e2e test prove nothing is sent anywhere.
export const fictionalAudit = [
  'FICTIONAL TEST AUDIT FICTIONAL-MARKER-7F3A NOT A REAL STUDENT',
  'OK   MINIMUM 128 UNITS FOR BS BIOMEDICAL ENGINEERING',
  'EARNED: 66 UNITS',
  'IN-PROCESS: 12 UNITS',
  'NEEDS: 50 UNITS',
  'OK   LOWER DIVISION MATHEMATICS',
  '20231 MATH 226 CALCULUS III 4.0 A',
  '20232 CSCI 102 FUNDAMENTALS OF COMPUTATION 4.0 B+',
  'NO   ENGINEERING MATH',
  'SELECT FROM: MATH 245',
  'NO   BIOMEDICAL ENGINEERING CORE',
  'SELECT FROM: BME 210, EE 202',
  'NEEDS: 8 UNITS',
  'IP   WRITING REQUIREMENT',
  'IP: 4 UNITS',
  'NO   TECHNICAL ELECTIVE',
  'SELECT FROM: BME 201, HBIO 301',
];
