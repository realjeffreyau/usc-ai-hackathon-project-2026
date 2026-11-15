# Security and privacy

This is a frontend hackathon prototype intended for fictional-data judging. Do not commit real STARS reports, student identifiers, credentials, saved portal pages, or screenshots containing student information. Use the generated synthetic fixtures under `tests/`.

## Data handling

Audit files, parsed requirements, preferences, schedules, and WebReg records remain in JavaScript memory. They are not uploaded, logged, or written to browser storage. Refreshing or navigating resets them. The optional copy action writes section numbers to the system clipboard at the user's request.

The standalone app has a strict Content Security Policy with `connect-src 'self'` to load its bundled CSS, font, and catalogue JSON. Catalogue paths accept only a fixed index name or a numeric program ID; audit contents are never used in asset requests. The extension loads its own bundled modules, CSS, font, and PDF worker. Its on-device Chrome AI receives only a typed goal, with validated output and a local rules fallback. Chrome's own model download is outside the application's network controls.

The extension shares WebReg's rendered document. An open shadow root isolates styling, not sensitive information from host-page scripts or other extensions. Do not treat it as a secure container for a real academic record; prefer the standalone app and fictional data for review.

## Protections checked

- Limits on PDF size (5 MB), pages (24), extraction time (12 seconds), and pasted audit length (400,000 characters).
- Local PDF.js 6.5.438; eval and XFA disabled; no document viewer, PDF action execution, remote worker, or remote model API.
- Text-node rendering of imported strings; no application HTML injection APIs.
- No general extension API permissions or host permissions. Content injection is scoped to `https://webreg.usc.edu/*`; no registration automation.
- No app browser storage, analytics, or sensitive-data logging.
- Loopback-only development server, public-assets-only serving, write-method rejection, Host validation, security headers, and traversal checks.
- Ignore rules for reports, environment files, private keys, archives, screenshots, and local tool configuration.

## Publication checks (2026-11-15)

76 unit/static checks, 11 website workflow checks, 12 import/privacy checks, and 18 extension browser checks were run with fictional fixtures. Browser checks include PDF import, hostile markup, storage/network assertions, and no registration clicks. Gitleaks 8.30.1 was run with output redacted on both publication files and Git history. No secrets were detected.

The two vendored PDF.js files match the legacy build in the official npm tarball, whose SHA-512 integrity was verified. A temporary dependency manifest pinned to `pdfjs-dist@6.5.438` was audited with npm: zero known vulnerabilities reported. `npm audit` on this dependency-free app alone would not inspect vendored files. See `THIRD_PARTY.md` for hashes and upstream advisories.

No review can guarantee vulnerability-free code. These results are point-in-time checks, not a penetration test or proof of authenticated portal safety. Recheck upstream advisories before updating bundled libraries or using real student data. The local server is for development; any future deployment must preserve the CSP and other headers.

## Reporting a problem

Do not include student information, secrets, or real audit attachments in public issues. If GitHub private vulnerability reporting is enabled, use the repository's **Security → Report a vulnerability** option. Otherwise report only a non-sensitive description and arrange a private channel before sharing exploit details.

The test browser reports that Chrome’s on-device text service is unavailable; this known browser diagnostic is excluded from the error assertion after the bundled rules fallback is exercised. Other browser errors and failed requests fail the checks. Model-backed planning is unverified.
