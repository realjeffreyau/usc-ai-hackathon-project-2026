# Bundled third-party assets

## PDF.js

- Package: `pdfjs-dist@6.5.438`, legacy browser build.
- Source: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz
- npm integrity: `sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==`
- License: Apache-2.0; retained in `dist/vendor/LICENSE.pdfjs` and `extension/src/vendor/LICENSE.pdfjs`.
- Upstream advisories: https://github.com/mozilla/pdf.js/security/advisories

Both files match the official package at `package/legacy/build/`. SHA-256 hashes:

- `pdf.mjs`: `2792b7c390ad6d5f4245d326b70deebbc990fa4bcac691412f6df886abb9e867`
- `pdf.worker.mjs`: `8336aabf764cb08c818555a2fd2545e4fed10837146de927564875c93b3c4f83`

To recheck advisories without adding a runtime dependency, create a temporary npm project outside this repository, pin `pdfjs-dist` to the version above, run `npm install --package-lock-only --ignore-scripts`, and run `npm audit`. Never run dependency-install scripts when inspecting a package. Compare its integrity and bundled file hashes before replacing vendor files.

## DM Sans

Bundled font: `dist/vendor/dm-sans.woff2`, copied to `extension/src/vendor/`. Its SIL Open Font License is retained as `LICENSE.dm-sans` in both vendor folders.
