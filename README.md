# Ornament studio

A local-first bead pattern editor with a printable grid and synchronized 3D preview. The existing cell-to-bead mapping and profile format are preserved.

## Run

Run `npm run serve` (Python 3 required), then open http://localhost:8000. Hosting requires only static files. HTTPS or localhost enables the offline service worker. p5 1.9.4 is bundled in `vendor/` under its LGPL license.

Drag on the grid to paint; right-drag to erase. Touch users can select the eraser. Turn painting off to scroll the large grid on a phone. Focus the preview and use arrow keys/WASD, or drag it, to rotate. Scroll/pinch to zoom. Performance quality changes apply immediately.

Undo/redo keeps up to 50 edits, grouping each drag into one stroke. Browser storage recovers the working draft after reload, including edits after the last named profile save. Use Export JSON for a portable backup. Invalid imports leave the current design intact. PNG and print output exclude the hover cursor.

## Checks

`npm test` runs the mapping, profile validation and history regression tests with Node.js 18+. Manually check drag painting/erasing, profile import/export, print/PNG and phone sizing when changing rendering code. The mapping intentionally includes only the beads in the supplied pattern; this branch does not invent additional mappings.

Optional browser regression suite: `npm install`, `npx playwright install chromium`, then `npm run test:browser`. It covers painting, undo/redo, invalid import preservation, draft recovery, PNG output, phone sizing, touch input, pan mode and offline reload. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium installation.
