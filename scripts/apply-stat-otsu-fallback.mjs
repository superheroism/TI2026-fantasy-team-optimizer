import { readFileSync, writeFileSync } from 'node:fs';

const path='src/import/emblemOcrRefinement.ts';
let text=readFileSync(path,'utf8');

const importNeedle="import { matchActionText, matchStatLines, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';";
if(!text.includes(importNeedle))throw new Error('OCR domain import marker not found');
text=text.replace(importNeedle,`${importNeedle}\nimport { otsuWhitenessRgba } from './ocrImagePreprocess.js';`);

const confidenceMarker='function confidenceFor(raw:RawScreenshotImport,path:string):number{return raw.fieldConfidence?.find(x=>x.path===path)?.confidence??0;}';
if(!text.includes(confidenceMarker))throw new Error('confidence marker not found');
const canvasHelper=`function otsuCanvas(source:HTMLCanvasElement):HTMLCanvasElement{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d');if(!x)throw new Error('Canvas unavailable.');x.drawImage(source,0,0);const image=x.getImageData(0,0,c.width,c.height),processed=otsuWhitenessRgba(image.data);image.data.set(processed.rgba);x.putImageData(image,0,0);return c;}\n`;
text=text.replace(confidenceMarker,canvasHelper+confidenceMarker);

const statRetryPattern=/(    if\(confidenceFor\(raw,sp\)<\.9\)\{const base=extractionToSource\(d\.roi,metrics\),statStrip=[^\n]+\n)(    const tier=)/;
const match=text.match(statRetryPattern);
if(!match)throw new Error('stat retry marker not found');
const fallback=`    if(confidenceFor(raw,sp)<.9){const pct=d.words.find(word=>/^\\+?\\d+%$/.test(word.text.trim())),left=d.roi.left+d.roi.width*.06,right=pct?Math.max(d.roi.left+d.roi.width*.45,pct.x-d.roi.width*.08):d.roi.left+d.roi.width*.70,nameRoi={left,top:d.roi.top,width:Math.max(d.roi.width*.35,right-left),height:d.roi.height*.38},statNameStrip=extractionToSource(nameRoi,metrics),processed=otsuCanvas(canvas(src,statNameStrip)),statRec=await w.recognize(processed,{tessedit_pageseg_mode:'7'},{tsv:true}),statRetryWords=parse(statRec.data.tsv),statRetryLines=lines(statRetryWords),sm=matchStatLines(statRetryLines.map(line=>line.text),LEGAL_STAT_POOLS[layout.roles[role][i]!.color]),evidenceWords=sm.lineIndices.flatMap(index=>statRetryLines[index]?.words??[]),sc=combined(sm.score,evidenceWords);retries++;emblemRetries++;if(sm.score>=.92&&sc>=.9&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);d.normalizedStat=sm.value;d.statMatchScore=sm.score;}}\n`;
text=text.replace(statRetryPattern,match[1]+fallback+match[2]);
writeFileSync(path,text);
