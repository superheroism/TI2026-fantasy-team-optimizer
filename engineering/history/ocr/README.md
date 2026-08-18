# Screenshot OCR history

This directory contains the completed P51/P52 screenshot-import investigation, benchmark, corpus, and certification records.

These files are historical evidence, not active release gates. The current implementation contract lives in `SCREENSHOT_IMPORT_PIPELINE.md` at the repository root, while normal repository validation is handled by the single `CI` workflow.

Heavy real-image OCR and browser checks remain available as explicit local commands (`npm run test:ocr-corpus`, `npm run test:screenshot-e2e:chromium`, and `npm run test:screenshot-e2e:firefox`) when screenshot-import work is resumed.
