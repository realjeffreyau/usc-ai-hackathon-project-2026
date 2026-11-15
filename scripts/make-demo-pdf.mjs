// Writes a fictional text-based STARS-style PDF for demos: node scripts/make-demo-pdf.mjs [out.pdf]
import { writeFileSync } from 'node:fs';
import { fictionalAudit, makePdf } from '../tests/pdf-fixture.mjs';
const out = process.argv[2] ?? 'fictional-audit.pdf';
writeFileSync(out, makePdf(fictionalAudit));
console.log(`Wrote ${out} (fictional data only)`);
