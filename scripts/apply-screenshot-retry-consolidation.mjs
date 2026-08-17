import { readFileSync, writeFileSync } from 'node:fs';

const path='src/import/emblemOcrRefinement.ts';
let text=readFileSync(path,'utf8');
const rawRetry=`    if(confidenceFor(raw,sp)<.9){const base=extractionToSource(d.roi,metrics),statStrip={left:base.left,top:base.top,width:base.width,height:base.height*.38},statRec=await w.recognize(canvas(src,statStrip),{tessedit_pageseg_mode:'7'},{tsv:true}),statRetryWords=parse(statRec.data.tsv),statRetryLines=lines(statRetryWords),sm=matchStatLines(statRetryLines.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),evidenceWords=sm.lineIndices.flatMap(index=>statRetryLines[index]?.words??[]).filter(word=>!/^\\+?\\d+%$/.test(word.text.trim())),sc=combined(sm.score,evidenceWords);retries++;emblemRetries++;if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);d.normalizedStat=sm.value;d.statMatchScore=sm.score;}}\n`;
if(text.includes(rawRetry)) text=text.replace(rawRetry,'');
const unguarded="}else if(!tier.direct){const base=extractionToSource(d.roi,metrics),strip=";
const guarded="}else if(!tier.direct&&confidenceFor(raw,qp)<.9){const base=extractionToSource(d.roi,metrics),strip=";
if(text.includes(unguarded)) text=text.replace(unguarded,guarded);
else if(!text.includes(guarded)) throw new Error('Expected tier retry branch not found; source changed.');
writeFileSync(path,text);
