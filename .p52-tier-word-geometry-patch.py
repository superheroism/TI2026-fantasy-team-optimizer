from pathlib import Path

p=Path('src/import/emblemOcrRefinement.ts')
s=p.read_text()
old="function ambiguousTierGlyph(tier:ReturnType<typeof bestTierLine>):{tierWord:Word;glyphWord:Word}|undefined{if(!tier.direct||tier.match.value!==1||!tier.line)return undefined;const ws=tier.line.words,tierIndex=ws.findIndex(w=>ocrSimilarity(w.text,'TIER')>=.62);if(tierIndex<0)return undefined;const tierWord=ws[tierIndex]!;for(const glyphWord of ws.slice(tierIndex+1,tierIndex+3)){const token=glyphWord.text.toUpperCase().replace(/[^A-Z0-9\\]|]/g,''),confused=token.replace(/[1L|]/g,'I').replace(/]/g,'I');if(confused==='I'&&glyphWord.confidence<TIER_GLYPH_RETRY_CONFIDENCE_CEILING)return{tierWord,glyphWord};}return undefined;}"
new="function ambiguousTierGlyph(words:readonly Word[],currentTier:QualityTier):{tierWord:Word;glyphWord:Word}|undefined{if(currentTier!==1)return undefined;for(const tierWord of words.filter(w=>ocrSimilarity(w.text,'TIER')>=.62)){const tierRight=tierWord.left+tierWord.width,tierY=tierWord.top+tierWord.height/2;for(const glyphWord of words){const token=glyphWord.text.toUpperCase().replace(/[^A-Z0-9\\]|]/g,''),confused=token.replace(/[1L|]/g,'I').replace(/]/g,'I'),glyphY=glyphWord.top+glyphWord.height/2,yTolerance=Math.max(tierWord.height,glyphWord.height)*.7,rightGap=glyphWord.left-tierRight,maxGap=Math.max(12,tierWord.height*1.5);if(confused==='I'&&glyphWord.confidence<TIER_GLYPH_RETRY_CONFIDENCE_CEILING&&Math.abs(glyphY-tierY)<=yTolerance&&rightGap>=-2&&rightGap<=maxGap)return{tierWord,glyphWord};}}return undefined;}"
assert old in s, 'old ambiguousTierGlyph not found'
s=s.replace(old,new,1)
old_call="const tier=bestTierLine(ls),tierConfidence=combined(tier.match.score,tier.line?.words??words),ambiguousGlyph=ambiguousTierGlyph(tier);"
new_call="const tier=bestTierLine(ls),tierConfidence=combined(tier.match.score,tier.line?.words??words),ambiguousGlyph=ambiguousTierGlyph(words,raw.banners[role].emblems[i]!.qualityTier);"
assert old_call in s, 'old ambiguous glyph call not found'
s=s.replace(old_call,new_call,1)
p.write_text(s)

t=Path('tests/p52-tier-glyph-retry.test.mjs')
ts=t.read_text()
ts=ts.replace("assert.match(source,/!tier\\.direct\\|\\|tier\\.match\\.value!==1\\|\\|!tier\\.line/);", "assert.match(source,/currentTier!==1/);\n  assert.match(source,/words\\.filter\\(w=>ocrSimilarity\\(w\\.text,'TIER'\\)>=\\.62\\)/);\n  assert.match(source,/Math\\.abs\\(glyphY-tierY\\)<=yTolerance/);\n  assert.match(source,/rightGap>=-2&&rightGap<=maxGap/);\n  assert.match(source,/ambiguousTierGlyph\\(words,raw\\.banners\\[role\\]\\.emblems\\[i\\]!\\.qualityTier\\)/);")
t.write_text(ts)
