# Screenshot OCR fixture sources

The repository commits manually established ground truth in `screenshot-corpus-ground-truth.json`, but does not commit the user-supplied screenshot binaries themselves.

For reproducible live/browser validation, source identity metadata may be recorded directly on a fixture. The current full-client performance fixture is:

- fixture: `expanded5-actions-full-client-noone-2048x1151`
- source file: `TI2026 - Board 2.png`
- dimensions: 2048 × 1151
- SHA-256: `9b3fc2aed9375a49f3cdce2ffffff0e79cb357feb5054e040cb55d5a1ae2c5d2`

A live result should only be attributed to that fixture when the supplied screenshot matches the recorded identity metadata.
