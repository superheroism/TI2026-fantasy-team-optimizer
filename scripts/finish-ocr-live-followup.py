from pathlib import Path

# The first-stage patch writes domain matching and native refinement before its legacy
# exact-string guard fires. Complete the source edits against current compact formatting.
p=Path('src/import/localScreenshotOcr.ts')
s=p.read_text()
old_cap="const geometryConfidenceCap=localGeometry.method==='fallback'||extractionGeometry.method==='fallback'?.85:1;"
new_cap="const geometryConfidenceCap=extractionGeometry.method==='fallback'||pooledResult.synthesized?.85:localGeometry.method==='fallback'?.92:1;"
if old_cap not in s: raise SystemExit('geometry cap source not found')
s=s.replace(old_cap,new_cap)
old="const actionRows=pooled.length?pooled:ROLES.flatMap(r=>rows[r]),actions=await parseActions(worker,img,ex,crop,actionRows,fc,warnings),tokens=tokenCount(ex.words);if(geometryConfidenceCap<1){for(const field of fc)if(field.path.startsWith('operationIds.'))field.confidence=Math.min(field.confidence,geometryConfidenceCap);}const result:RawScreenshotImport={layoutId,banners,operationIds:actions.ops,fieldConfidence:fc,warnings};if(tokens){result.tokensRemaining=tokens.value;fc.push({path:'tokensRemaining',confidence:tokens.confidence});}"
new="const actionRows=pooled.length?pooled:ROLES.flatMap(r=>rows[r]),actions=await parseActions(worker,img,ex,crop,actionRows,fc,warnings);let tokens=tokenCount(ex.words),tokenRetryMs=0;if(!tokens){const ag=actionGeometry(ex,actionRows);if(ag){const pitch=actionRows.length>1?actionRows.slice(1).map((y,i)=>y-actionRows[i]!).sort((a,b)=>a-b)[Math.floor((actionRows.length-1)/2)]!:Math.max(55,ex.height*.08),r={left:Math.max(0,ag.cards[1]!.left),top:Math.max(0,ag.anchorY-pitch*.4),width:Math.min(ex.width-ag.cards[1]!.left,ag.cards[1]!.width*2.35),height:Math.min(ex.height-(ag.anchorY-pitch*.4),pitch*.95)},sr=sourceRect(r,crop,ex,img.naturalWidth,img.naturalHeight),retry=await run(worker,canvas(img,Number.POSITIVE_INFINITY,sr));tokenRetryMs=retry.elapsedMs;tokens=tokenCount(retry.words);}}if(geometryConfidenceCap<1){for(const field of fc)if(field.path.startsWith('operationIds.'))field.confidence=Math.min(field.confidence,geometryConfidenceCap);}const result:RawScreenshotImport={layoutId,banners,operationIds:actions.ops,fieldConfidence:fc,warnings};if(tokens){result.tokensRemaining=tokens.value;fc.push({path:'tokensRemaining',confidence:tokens.confidence});}else{fc.push({path:'tokensRemaining',confidence:0});warnings.push('Roll token count is missing or unreadable.');}"
if old not in s: raise SystemExit('action/token source not found')
s=s.replace(old,new)
s=s.replace('targetedRetryMs:actions.extraMs,totalMs:','targetedRetryMs:actions.extraMs+tokenRetryMs,totalMs:')
p.write_text(s)

p=Path('src/import/screenshotImport.ts')
s=p.read_text()
s=s.replace("import { refineUncertainEmblemStats } from './emblemOcrRefinement.js';","import { refineUncertainScreenshotFields } from './emblemOcrRefinement.js';")
old="export async function requestScreenshotImport(file:File,data:DataBundle):Promise<RawScreenshotImport>{lastLocalOcrMetrics=undefined;try{const local=await parseScreenshotLocally(file,data);lastLocalOcrMetrics=local.metrics;return await refineUncertainEmblemStats(file,data,local.result);}catch(localError){"
new="export async function requestScreenshotImport(file:File,data:DataBundle):Promise<RawScreenshotImport>{lastLocalOcrMetrics=undefined;try{const local=await parseScreenshotLocally(file,data),refined=await refineUncertainScreenshotFields(file,data,local.result,local.metrics);local.metrics.targetedRetryMs+=refined.elapsedMs;local.metrics.totalMs+=refined.elapsedMs;lastLocalOcrMetrics=local.metrics;return refined.result;}catch(localError){"
if old not in s: raise SystemExit('production refinement call not found')
s=s.replace(old,new)
p.write_text(s)

p=Path('tests/ocr-domain-match.test.mjs')
s=p.read_text()
old="  assert.equal(matchActionText('RANDOMLY \\\"od ne QUALIT INCH')?.id, 'quality-increase-one');"
if old not in s:
    old="  assert.equal(matchActionText('RANDOMLY \"od ne QUALIT INCH')?.id, 'quality-increase-one');"
new="  const quality = matchActionText('RANDOMLY \\\"od ne QUALIT INCH');\n  assert.equal(quality?.id, 'quality-increase-one');\n  assert.ok((quality?.score ?? 0) >= .58);"
if old not in s: raise SystemExit('quality action test source not found')
s=s.replace(old,new)
p.write_text(s)

Path('SCREENSHOT_OCR_LIVE_VALIDATION_2026-08-16_FOLLOWUP.md').write_text('''# Screenshot OCR live follow-up — 2026-08-16

## Browser result after PR #40

The same 2560×1600 phone-browser fixture was rerun after the token-aware extraction fix. The rerun confirmed that the safety-critical `130% -> 30% -> Tier II @ 0.99` error is gone. Explicit OCR tokens now survive normalization (`DEATHS`, `GPM`, `FRIENDLY`, `VAMPIRIC`), and action cards 1 and 3 resolve correctly.

The extraction lattice remained stable: card-anchor clustering recovered all three columns, three observed rows, `legacy_3`, and no synthesized rows. This confirms that another wholesale geometry rewrite is not justified by this fixture.

## Remaining failures

Several small card fields remain unreadable in the 1440 px extraction pass, especially quality numerals/bonuses and short stat titles. Core/Mid team evidence is also too small at extraction resolution. The middle action is correctly ranked as `quality-increase-one` but its noisy browser string scores about 0.56, just below the production 0.58 acceptance gate. Token count is not present in extraction OCR despite being visible in the source.

## Follow-up correction

- Retry only unresolved emblem cards from small native-resolution ROIs mapped from the recovered extraction lattice; one card retry supplies stat, tier, and trait evidence together.
- Retry weak team/player regions at native resolution.
- Keep the action catalog constraint, but recognize stable truncated OCR stems such as `INC*` for `INCREASE`; the noisy live string must clear the existing 0.58 gate rather than lowering the gate globally.
- When token count is absent, run one native footer retry derived from the observed action anchor.
- Do not repeat full-resolution whole-image OCR and do not upscale.
- A localization fallback followed by independently observed extraction columns/rows receives a 0.92 confidence cap; extraction fallback or synthesized rows retain the stricter 0.85 cap.

The change remains browser-gated: CI validates deterministic behavior and generated artifacts, but the same live fixture must be rerun before a merge recommendation.
''')
