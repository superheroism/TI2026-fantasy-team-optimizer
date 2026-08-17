from pathlib import Path

p=Path('src/import/emblemOcrRefinement.ts')
s=p.read_text()
anchor="const TRAITS:readonly TraitName[]=['Fractal','Friendly','Vampiric','Unique','Benevolent'];\n"
assert anchor in s, 'TRAITS anchor missing'
s=s.replace(anchor,anchor+"const TIER_GLYPH_RETRY_CONFIDENCE_CEILING=60;\n",1)

old="function bestTierLine(ls:readonly Line[]):{match:{value:QualityTier;score:number};line?:Line;direct:boolean}{let best:{match:{value:QualityTier;score:number};line?:Line;direct:boolean}={match:{value:1,score:.2},direct:false};for(const line of ls){const exact=directTier(line);if(exact&&exact.score>best.match.score)best={match:exact,line,direct:true};else if(!best.direct){const match=matchTierText(line.text),hasTier=line.words.some(w=>ocrSimilarity(w.text,'TIER')>=.62),score=Math.min(.85,match.score+(hasTier ? .08 : 0));if(score>best.match.score)best={match:{value:match.value,score},line,direct:false};}}return best;}\n"
assert old in s, 'bestTierLine anchor missing'
helper="function ambiguousTierGlyph(tier:ReturnType<typeof bestTierLine>):{tierWord:Word;glyphWord:Word}|undefined{if(!tier.direct||tier.match.value!==1||!tier.line)return undefined;const ws=tier.line.words,tierIndex=ws.findIndex(w=>ocrSimilarity(w.text,'TIER')>=.62);if(tierIndex<0)return undefined;const tierWord=ws[tierIndex]!;for(const glyphWord of ws.slice(tierIndex+1,tierIndex+3)){const token=glyphWord.text.toUpperCase().replace(/[^A-Z0-9\\]|]/g,''),confused=token.replace(/[1L|]/g,'I').replace(/]/g,'I');if(confused==='I'&&glyphWord.confidence<TIER_GLYPH_RETRY_CONFIDENCE_CEILING)return{tierWord,glyphWord};}return undefined;}\n"
s=s.replace(old,old+helper,1)

old2="const tier=bestTierLine(ls),tierConfidence=combined(tier.match.score,tier.line?.words??words);if(tier.direct&&tierConfidence>confidenceFor(raw,qp)){raw.banners[role].emblems[i]!.qualityTier=tier.match.value;replaceConfidence(raw,qp,Math.min(.84,tierConfidence));d.normalizedTier=tier.match.value;d.tierMatchScore=tier.match.score;}if(!budget.exhausted&&!tier.direct&&!strongSupplementalTier&&shouldRetryTier(confidenceFor(raw,qp))){"
assert old2 in s, 'tier application anchor missing'
new2="const tier=bestTierLine(ls),tierConfidence=combined(tier.match.score,tier.line?.words??words),ambiguousGlyph=ambiguousTierGlyph(tier);if(tier.direct&&tierConfidence>confidenceFor(raw,qp)){raw.banners[role].emblems[i]!.qualityTier=tier.match.value;replaceConfidence(raw,qp,Math.min(.84,tierConfidence));d.normalizedTier=tier.match.value;d.tierMatchScore=tier.match.score;}if(!budget.exhausted&&ambiguousGlyph&&shouldRetryTier(confidenceFor(raw,qp))){const {tierWord,glyphWord}=ambiguousGlyph,localPadX=Math.max(2,tierWord.height*.3),localPadY=Math.max(2,tierWord.height*.45),localLeft=Math.max(0,tierWord.left-localPadX),localTop=Math.max(0,Math.min(tierWord.top,glyphWord.top)-localPadY),localRight=Math.min(emblemCanvas.width,Math.max(tierWord.left+tierWord.width,glyphWord.left+glyphWord.width)+Math.max(4,tierWord.height*1.1)),localBottom=Math.min(emblemCanvas.height,Math.max(tierWord.top+tierWord.height,glyphWord.top+glyphWord.height)+localPadY),sourceLeft=Math.max(0,Math.floor(rr.left)),sourceTop=Math.max(0,Math.floor(rr.top)),tightLeft=Math.max(0,sourceLeft+localLeft),tightTop=Math.max(0,sourceTop+localTop),tightRight=Math.min(src.naturalWidth,sourceLeft+localRight),tightBottom=Math.min(src.naturalHeight,sourceTop+localBottom),tightWidth=tightRight-tightLeft,tightHeight=tightBottom-tightTop;if(tightWidth>0&&tightHeight>0){const tightTierStrip={left:tightLeft,top:tightTop,width:tightWidth,height:tightHeight},tightTierCanvas=otsuCanvas(canvas(src,tightTierStrip)),tightTierRec=await recognize(w,tightTierCanvas,budget,`tier:${role}:${i+1}:glyph`,7,tightTierStrip),tightTierWords=parse(tightTierRec.data.tsv),tightTier=bestTierLine(lines(tightTierWords)),tightTierConfidence=combined(tightTier.match.score,tightTier.line?.words??tightTierWords);retries++;emblemRetries++;if(tightTier.direct&&tightTierConfidence>tierConfidence){raw.banners[role].emblems[i]!.qualityTier=tightTier.match.value;replaceConfidence(raw,qp,Math.min(.84,tightTierConfidence));d.normalizedTier=tightTier.match.value;d.tierMatchScore=tightTier.match.score;}}}if(!budget.exhausted&&!tier.direct&&!strongSupplementalTier&&shouldRetryTier(confidenceFor(raw,qp))){"
s=s.replace(old2,new2,1)
p.write_text(s)

test=Path('tests/p52-tier-glyph-retry.test.mjs')
test.write_text('''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');

test('ambiguous direct Tier-I glyph retry is structurally narrow, direct-evidence-only, and fail-closed',()=>{
  assert.match(source,/const TIER_GLYPH_RETRY_CONFIDENCE_CEILING=60/);
  assert.match(source,/!tier\\.direct\\|\\|tier\\.match\\.value!==1\\|\\|!tier\\.line/);
  assert.match(source,/confused==='I'&&glyphWord\\.confidence<TIER_GLYPH_RETRY_CONFIDENCE_CEILING/);
  assert.match(source,/tightRight=Math\\.min\\(src\\.naturalWidth,sourceLeft\\+localRight\\)/);
  assert.match(source,/tightBottom=Math\\.min\\(src\\.naturalHeight,sourceTop\\+localBottom\\)/);
  assert.match(source,/if\\(tightWidth>0&&tightHeight>0\\)/);
  assert.match(source,/tightTierCanvas=otsuCanvas\\(canvas\\(src,tightTierStrip\\)\\)/);
  assert.match(source,/`tier:\\$\\{role\\}:\\$\\{i\\+1\\}:glyph`/);
  assert.match(source,/tightTier\\.direct&&tightTierConfidence>tierConfidence/);
  assert.match(source,/Math\\.min\\(\\.84,tightTierConfidence\\)/);
  assert.equal((source.match(/`tier:\\$\\{role\\}:\\$\\{i\\+1\\}:glyph`/g)??[]).length,1);
  assert.doesNotMatch(source,/percentage.*tier|tier.*percentage/i);
});
''')
