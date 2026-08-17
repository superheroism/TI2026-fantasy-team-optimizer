import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const args = new Set(process.argv.slice(2));
const valueArg = (name, fallback) => {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};
const productionRoot = resolve(valueArg('--production-root', '.'));
const corpusRoot = resolve(valueArg('--corpus-root', '.'));
const reportOnly = args.has('--report-only');
const resultPath = resolve(valueArg('--output', process.env.P52_OCR_RESULT_PATH || 'artifacts/p52-ocr-corpus-results.json'));
const roles = ['core', 'mid', 'support'];

function mime(path) {
  return ({
    '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8', '.png':'image/png', '.webp':'image/webp',
    '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.map':'application/json; charset=utf-8',
    '.wasm':'application/wasm'
  })[extname(path).toLowerCase()] || 'application/octet-stream';
}
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = resolve(root, decoded);
  if (target !== root && !target.startsWith(root + sep)) throw new Error('Path escape rejected.');
  return target;
}
async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/_p52.html') {
        res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
        res.end('<!doctype html><meta charset="utf-8"><title>P52 OCR corpus</title>');
        return;
      }
      let root, relative;
      if (url.pathname.startsWith('/prod/')) {
        root = productionRoot; relative = url.pathname.slice('/prod/'.length);
      } else if (url.pathname.startsWith('/corpus/')) {
        root = corpusRoot; relative = url.pathname.slice('/corpus/'.length);
      } else if (url.pathname.startsWith('/data/')) {
        root = productionRoot; relative = url.pathname.slice(1);
      } else {
        res.writeHead(404); res.end('not found'); return;
      }
      const path = safeJoin(root, relative);
      const bytes = await readFile(path);
      res.writeHead(200, {'content-type':mime(path),'cache-control':'no-store'});
      res.end(bytes);
    } catch (error) {
      res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
      res.end(String(error));
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind corpus HTTP server.');
  return {server, port:address.port};
}
function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    'google-chrome-stable',
    'google-chrome',
    'chromium',
    'chromium-browser',
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
}
function resolveChrome() {
  for (const candidate of chromeCandidates()) {
    if (candidate.includes(sep) && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['--version'], {encoding:'utf8'});
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('Chrome/Chromium was not found. Set CHROME_PATH to the browser executable.');
}
async function freePort() {
  return await new Promise((resolvePromise, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const address = s.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate DevTools port.'));
      const port = address.port;
      s.close(error => error ? reject(error) : resolvePromise(port));
    });
  });
}
async function pollJson(url, timeoutMs=15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      last = new Error(`${response.status} ${response.statusText}`);
    } catch (error) { last = error; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for Chrome DevTools: ${String(last)}`);
}
class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new globalThis.WebSocket(url);
  }
  async open() {
    if (this.socket.readyState === globalThis.WebSocket.OPEN) return;
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, {once:true});
      this.socket.addEventListener('error', reject, {once:true});
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params={}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, {resolve:resolvePromise,reject});
      this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}
async function startChrome(pageUrl) {
  const chromePath = resolveChrome();
  const port = await freePort();
  const profile = await mkdtemp(join(tmpdir(), 'p52-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ], {stdio:['ignore','ignore','pipe']});
  let stderr = '';
  chrome.stderr.on('data', chunk => { stderr += String(chunk); });
  await pollJson(`http://127.0.0.1:${port}/json/version`);
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, {method:'PUT'});
  if (!response.ok) throw new Error(`Could not open Chrome target: ${response.status} ${response.statusText}`);
  const target = await response.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', {url:pageUrl});
  await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  return {
    cdp, chrome, chromePath, stderr:()=>stderr,
    async close() {
      try { cdp.close(); } catch {}
      if (chrome.exitCode === null) {
        try { chrome.kill('SIGTERM'); } catch {}
        await new Promise(resolvePromise => {
          const timer=setTimeout(resolvePromise,1000);
          chrome.once('exit',()=>{clearTimeout(timer);resolvePromise();});
        });
      }
      await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
  };
}
function geometryInvalid(rect, width, height, checkBounds=true) {
  if (!rect) return false;
  const values = [rect.left,rect.top,rect.width,rect.height];
  if (values.some(value => !Number.isFinite(value))) return true;
  if (rect.left < 0 || rect.top < 0 || rect.width <= 0 || rect.height <= 0) return true;
  if (checkBounds && Number.isFinite(width) && Number.isFinite(height) &&
      (rect.left + rect.width > width + 1 || rect.top + rect.height > height + 1)) return true;
  return false;
}
function confidenceMap(raw) {
  return new Map((raw?.fieldConfidence || []).map(row => [row.path, row.confidence]));
}
function compareToTruth(raw, truth) {
  const checks = [];
  const confidence = confidenceMap(raw);
  const add = (kind, path, actual, expected) => checks.push({
    kind, path, actual:actual ?? null, expected, correct:actual === expected,
    confidence:confidence.get(path) ?? null
  });
  add('layout','layoutId',raw?.layoutId,truth.layoutId);
  for (const role of roles) {
    const expected = truth.banners[role].emblems;
    const actual = raw?.banners?.[role]?.emblems || [];
    for (let i=0;i<expected.length;i++) {
      add('stat',`banners.${role}.emblems.${i}.stat`,actual[i]?.stat,expected[i].stat);
      add('tier',`banners.${role}.emblems.${i}.qualityTier`,actual[i]?.qualityTier,expected[i].qualityTier);
      add('trait',`banners.${role}.emblems.${i}.trait`,actual[i]?.trait,expected[i].trait);
    }
  }
  truth.actions.forEach((action,index)=>add('action',`operationIds.${index}`,raw?.operationIds?.[index],action.id));
  add('token','tokensRemaining',raw?.tokensRemaining,truth.tokensRemaining);
  const count = kind => checks.filter(check=>check.kind===kind && check.correct).length;
  const total = kind => checks.filter(check=>check.kind===kind).length;
  return {
    checks,
    layoutCorrect:checks.find(check=>check.kind==='layout')?.correct || false,
    statsExact:`${count('stat')}/${total('stat')}`,
    tiersExact:`${count('tier')}/${total('tier')}`,
    traitsExact:`${count('trait')}/${total('trait')}`,
    actionsExact:`${count('action')}/${total('action')}`,
    tokenExact:checks.find(check=>check.kind==='token')?.correct || false,
    falseHighConfidenceErrors:checks.filter(check=>!check.correct && typeof check.confidence==='number' && check.confidence>=.9).length,
    exact:checks.every(check=>check.correct),
  };
}
async function readCorpus() {
  const boardDir = join(corpusRoot, 'tests/test_boards');
  const names = (await readdir(boardDir)).filter(name=>name.endsWith('.ground-truth.json')).sort();
  return await Promise.all(names.map(async name => JSON.parse(await readFile(join(boardDir,name),'utf8'))));
}
function boardExpression(sourceFile) {
  return `(async()=> {
    const [{requestScreenshotImport,getLastLocalOcrMetrics},{loadStatisticalModel}] = await Promise.all([
      import('/prod/build/js/import/screenshotImport.js'),
      import('/prod/build/js/data/statisticalModel.js')
    ]);
    window.__p52Data ??= await loadStatisticalModel();
    const source = ${JSON.stringify(sourceFile)};
    const response = await fetch('/corpus/tests/test_boards/' + encodeURIComponent(source), {cache:'no-store'});
    if (!response.ok) throw new Error('Corpus image load failed: ' + response.status + ' ' + response.statusText);
    const blob = await response.blob();
    const file = new File([blob], source, {type:blob.type || (source.toLowerCase().endsWith('.webp')?'image/webp':'image/png')});
    const started = performance.now();
    let raw = null, error = null;
    try { raw = await requestScreenshotImport(file, window.__p52Data); }
    catch (e) { error = e instanceof Error ? (e.stack || e.message) : String(e); }
    const metrics = getLastLocalOcrMetrics?.() ?? null;
    return {raw,metrics,error,elapsedMs:performance.now()-started};
  })()`;
}
function summarizeRun(truth, browserResult) {
  const metrics = browserResult?.metrics || null;
  const raw = browserResult?.raw || null;
  const calls = metrics?.ocrExecution?.calls || [];
  const emblemDiagnostics = metrics?.diagnostic?.emblems || [];
  // Call crops are reported in mixed source/extraction coordinate systems on historical builds;
  // count only structural invalidity here. Emblem ROIs have a stable extraction-space frame.
  const invalidCalls = calls.filter(call=>geometryInvalid(call.crop,call.canvasWidth,call.canvasHeight,false));
  const invalidEmblems = emblemDiagnostics.filter(emblem=>geometryInvalid(
    emblem.roi, metrics?.extractionWidth, metrics?.extractionHeight
  ));
  const comparison = compareToTruth(raw, truth);
  const reviewFields = (raw?.fieldConfidence || []).filter(field=>field.confidence < .9);
  return {
    sourceFile:truth.sourceFile,
    stressCase:truth.stressCase || null,
    elapsedMs:browserResult?.elapsedMs ?? null,
    error:browserResult?.error ?? null,
    inferredLayout:raw?.layoutId ?? metrics?.diagnostic?.inferredLayout ?? null,
    roleColumnMethod:metrics?.diagnostic?.extractionColumnMethod ?? null,
    rowDetection:{
      globalRows:metrics?.diagnostic?.globalRows ?? [],
      rowsByColumn:metrics?.diagnostic?.tierRowsByColumn ?? null,
      synthesizedRows:metrics?.diagnostic?.synthesizedRows ?? null,
    },
    emblems:emblemDiagnostics.map(emblem=>({
      role:emblem.role,rowIndex:emblem.rowIndex,roi:emblem.roi,
      normalizedStat:emblem.normalizedStat,normalizedTier:emblem.normalizedTier,
      normalizedTrait:emblem.normalizedTrait,reviewRequired:emblem.reviewRequired,
      finalConfidence:emblem.finalConfidence,
    })),
    rosterEvidence:metrics?.diagnostic?.teamEvidence ?? null,
    operationIds:raw?.operationIds ?? null,
    tokensRemaining:raw?.tokensRemaining ?? null,
    fieldConfidence:raw?.fieldConfidence ?? [],
    reviewRequiredFields:reviewFields.map(field=>field.path),
    ocrCallCount:calls.length,
    timeoutCount:calls.filter(call=>call.outcome==='timeout').length,
    invalidGeometryCount:invalidCalls.length + invalidEmblems.length,
    invalidCallGeometry:invalidCalls,
    invalidEmblemGeometry:invalidEmblems.map(emblem=>({role:emblem.role,rowIndex:emblem.rowIndex,roi:emblem.roi})),
    ocrCalls:calls,
    comparison,
  };
}
function printSummary(result) {
  const status = result.comparison.exact && !result.error ? 'PASS' : 'FAIL';
  console.log(
    `${status} ${result.sourceFile}: layout=${result.inferredLayout ?? 'unresolved'} ` +
    `stat=${result.comparison.statsExact} tier=${result.comparison.tiersExact} ` +
    `trait=${result.comparison.traitsExact} actions=${result.comparison.actionsExact} ` +
    `token=${result.comparison.tokenExact?'ok':'bad'} calls=${result.ocrCallCount} ` +
    `timeouts=${result.timeoutCount} invalid=${result.invalidGeometryCount} ` +
    `elapsed=${Math.round(result.elapsedMs ?? 0)}ms`
  );
  if (result.error) console.log(`  error: ${result.error.split('\n')[0]}`);
}

const corpus = await readCorpus();
if (corpus.length !== 6) throw new Error(`Expected six P52 ground-truth sidecars, found ${corpus.length}.`);
const {server,port} = await startStaticServer();
const pageUrl = `http://127.0.0.1:${port}/_p52.html`;
let browser;
const results = [];
try {
  browser = await startChrome(pageUrl);
  console.log(`P52 OCR corpus: Chrome=${browser.chromePath}`);
  for (const truth of corpus) {
    const browserResult = await browser.cdp.evaluate(boardExpression(truth.sourceFile));
    const result = summarizeRun(truth, browserResult);
    results.push(result);
    printSummary(result);
  }
} finally {
  await browser?.close();
  await new Promise(resolvePromise=>server.close(resolvePromise));
}
const report = {
  schemaVersion:1,
  productionRoot,
  corpusRoot,
  generatedAt:new Date().toISOString(),
  results,
  totals:{
    boards:results.length,
    exactBoards:results.filter(result=>result.comparison.exact && !result.error).length,
    layoutCorrect:results.filter(result=>result.comparison.layoutCorrect).length,
    falseHighConfidenceErrors:results.reduce((sum,result)=>sum+result.comparison.falseHighConfidenceErrors,0),
    invalidGeometryCount:results.reduce((sum,result)=>sum+result.invalidGeometryCount,0),
    timeoutCount:results.reduce((sum,result)=>sum+result.timeoutCount,0),
    elapsedMs:results.reduce((sum,result)=>sum+(result.elapsedMs||0),0),
  }
};
await mkdir(dirname(resultPath), {recursive:true});
await writeFile(resultPath, JSON.stringify(report,null,2)+'\n');
console.log(`Machine-readable report: ${resultPath}`);
console.log(`Corpus exact boards: ${report.totals.exactBoards}/${report.totals.boards}; layouts: ${report.totals.layoutCorrect}/${report.totals.boards}; false-high-confidence=${report.totals.falseHighConfidenceErrors}; invalid=${report.totals.invalidGeometryCount}; timeouts=${report.totals.timeoutCount}`);
if (!reportOnly && results.some(result=>result.error || !result.comparison.exact)) process.exitCode = 1;
