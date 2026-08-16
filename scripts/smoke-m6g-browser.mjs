import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const port=4174;
const server=spawn('python3',['-m','http.server',String(port),'--directory','docs'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitForIdle(page,timeout=120000){
  await page.waitForFunction(()=>{
    const button=document.querySelector('#optimize');
    return button&&!button.disabled&&button.textContent==='Run Optimizer';
  },{timeout});
}

try{
  await sleep(700);
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});
  await page.waitForSelector('#board .banner');
  await page.waitForFunction(()=>document.querySelectorAll('#board .emblem').length===9);
  assert.equal(await page.$$eval('#board .emblem',nodes=>nodes.length),9,'initial legacy layout should render nine emblems');

  await page.click('[data-layout-slots="5"]');
  await page.waitForFunction(()=>document.querySelectorAll('#board .emblem').length===15);
  assert.equal(await page.$$eval('#board .emblem',nodes=>nodes.length),15,'expanded layout should render fifteen emblems');

  const originalStat=await page.$eval('#board .stat-select',select=>select.value);
  await page.$eval('#board .stat-select',select=>{
    const option=[...select.options].find(item=>item.value!==select.value);
    if(!option)throw new Error('No alternate stat option available');
    select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(value=>document.querySelector('#board .stat-select')?.value!==value,{},originalStat);
  assert.equal(await page.$eval('#rec-action',node=>node.textContent),'Setup changed');

  const originalOperation=await page.$eval('#ops .op-select',select=>select.value);
  await page.$eval('#ops .op-select',select=>{
    const option=[...select.options].find(item=>!item.disabled&&item.value!==select.value);
    if(!option)throw new Error('No alternate operation option available');
    select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(value=>document.querySelector('#ops .op-select')?.value!==value,{},originalOperation);

  await page.click('#optimize');
  await waitForIdle(page);
  const firstRecommendation=await page.$eval('#rec-action',node=>node.textContent||'');
  assert.ok(firstRecommendation&&!/Recalculating|Calculating|error/i.test(firstRecommendation),`optimizer did not produce a recommendation: ${firstRecommendation}`);

  await page.click('#optimize');
  await page.waitForFunction(()=>document.querySelector('#optimize')?.disabled===true);
  await page.$eval('#tokens',input=>{
    input.value=String(Math.max(0,Number(input.value)-1));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await waitForIdle(page);
  await sleep(100);
  assert.equal(await page.$eval('#rec-action',node=>node.textContent),'Setup changed','state edit during optimization must leave stale recommendation invalidated');
  assert.equal(await page.$$eval('.recommended-target,.recommended-target-element,.op-card.recommended',nodes=>nodes.length),0,'stale recommendation highlights must not render');

  await page.click('#reset');
  await page.waitForFunction(()=>document.querySelectorAll('#board .emblem').length===15);
  assert.equal(await page.$eval('#tokens',input=>input.value),'10','reset should restore token count');
  assert.equal(await page.$eval('[data-layout-slots="5"]',button=>button.classList.contains('active')),true,'reset should preserve expanded layout');

  await page.click('[data-layout-slots="3"]');
  await page.waitForFunction(()=>document.querySelectorAll('#board .emblem').length===9);
  assert.equal(await page.$eval('[data-layout-slots="3"]',button=>button.classList.contains('active')),true);

  await page.click('#optimize');
  await waitForIdle(page);
  const legacyRecommendation=await page.$eval('#rec-action',node=>node.textContent||'');
  assert.ok(legacyRecommendation&&!/Recalculating|Calculating|error/i.test(legacyRecommendation));
  await page.click('#optimize');
  await waitForIdle(page);
  const repeatedRecommendation=await page.$eval('#rec-action',node=>node.textContent||'');
  assert.equal(repeatedRecommendation,legacyRecommendation,'repeated unchanged optimization should preserve deterministic recommendation presentation');

  assert.deepEqual(pageErrors,[],'browser page emitted errors');
  console.log(JSON.stringify({status:'pass',initial:'legacy_3',expandedEdit:true,menuEdit:true,activeOptimizationInvalidation:true,resetPreservesLayout:true,repeatedOptimization:true,recommendation:legacyRecommendation},null,2));
  await browser.close();
}finally{
  server.kill('SIGTERM');
}
