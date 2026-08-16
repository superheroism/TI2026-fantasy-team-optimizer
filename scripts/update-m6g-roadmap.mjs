import fs from 'node:fs';
const path='ENGINEERING_ROADMAP.md';
let source=fs.readFileSync(path,'utf8');
const heading='## M6G — UI/Application Layer Decomposition';
if(!source.includes(heading)){
  source+=`\n\n${heading}\n\n**Outcome: complete.** M6G decomposed the M6F browser application without changing optimizer semantics or the established worker/runtime boundary.\n\n- \`M6G_BASE_SHA = 4e80f0a77be571f2e51734c935dcd3b7dd476c02\`.\n- Canonical browser/application state and optimizer-relevant mutation invalidation now live in \`src/ui/state.ts\`.\n- Board rendering, controls, offered-action/result presentation, and plots are separated into \`boardView.ts\`, \`controls.ts\`, \`actionView.ts\`, and \`plots.ts\`.\n- \`src/ui/app.ts\` is now the composition/bootstrap and optimizer-orchestration layer.\n- Optimizer-relevant mutations invalidate displayed recommendations, cancel/supersede pending worker work, and remove stale highlights through one application-state boundary.\n- The M6F route remains unchanged: legacy exact; expanded t=1 exact; expanded t=2 M6E adaptive-tight; unsupported adaptive cases exact fallback.\n- Synchronous engine APIs and exact worker/synchronous parity remain preserved.\n- \`UI_APPLICATION_ARCHITECTURE.md\` documents the final browser module boundaries.\n\nM6G is the Phase-10 application-layer cleanup milestone. Longer-horizon search work remains separate and requires its own frozen package.\n`;
  fs.writeFileSync(path,source);
}
