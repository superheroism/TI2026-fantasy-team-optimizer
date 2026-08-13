import type { ActionEvaluation, BannerState, BoardState, DataBundle, MenuState, OfferedOperation, OptimizerState, RecommendationResult, Role, StatName, TraitName } from '../domain/types.js';
import { legalStats } from '../domain/rules.js';
import { defaultBoard, defaultMenu } from '../data/defaultState.js';
import { loadStatisticalModel } from '../data/statisticalModel.js';
import { attachedPlayers, displayTeamName, rosterForTeam } from '../data/ti2026Rosters.js';
import { formatAction, recommendNextAction } from '../engine/optimizer.js';
import { evaluateSelectedBoard, rankTeamsForRole } from '../engine/scoring.js';
import { evaluateBanner } from '../domain/bannerEvaluator.js';
import { ACTION_CATALOG, ACTION_BY_ID, cloneAction } from '../data/actionCatalog.js';
const roles:Role[]=['core','mid','support'];
const traits:TraitName[]=['Fractal','Friendly','Vampiric','Unique','Benevolent'];
let data!:DataBundle;
let board:BoardState=structuredClone(defaultBoard);
let menu:MenuState=structuredClone(defaultMenu);
let tokens=10,username='[Username]',targetScore=0,objective:OptimizerState['objective']='expected_score';
let comparisonRole:Role='core';
let theme:'dark'|'light'='dark';
let lastResult:RecommendationResult|null=null,lastOptimizerState:OptimizerState|null=null;
const actionTargetSelection=new Map<number,Role>();
const $=<T extends HTMLElement=HTMLElement>(sel:string)=>document.querySelector(sel) as T;
const fmt=(n:number)=>Number.isFinite(n)?Math.round(n).toLocaleString():'—';
const pct=(p:number|undefined)=>p===undefined?'—':`${(p*100).toFixed(1)}%`;
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function teamOptions(role:Role,selected:string):string{
  return data.players.filter(p=>p.role===role).sort((a,b)=>displayTeamName(a.team).localeCompare(displayTeamName(b.team)))
    .map(p=>`<option value="${escapeHtml(p.team)}" ${p.team===selected?'selected':''}>${escapeHtml(displayTeamName(p.team))}</option>`).join('');
}

function attachedPlayerLabel(team:string,role:Role):string{
  const players=attachedPlayers(team,role);
  return players.length?players.join(' + '):'Roster names unavailable';
}
function cssVar(name:string,fallback:string):string{
  const value=getComputedStyle(document.body).getPropertyValue(name).trim();
  return value||fallback;
}

function signedPct(n:number):string{return `${n>=0?'+':''}${n}%`;}
function card(role:Role,banner:BannerState,index:0|1|2):string{
  const e=banner.emblems[index],pool=legalStats(e.color),derived=evaluateBanner(banner)[index];
  const effects=derived.effects.length
    ? derived.effects.map(x=>`${x.trait} ${signedPct(x.modifierPct)}${x.sourcePosition===index?'':` from slot ${x.sourcePosition+1}`}`).join(' · ')
    : 'No active trait modifier on this slot';
  return `<div class="emblem ${e.color}" data-role="${role}" data-index="${index}">
    <div class="client-row client-row-stat" data-element="stat">
      <span class="client-kind">STAT</span>
      <select class="client-select stat-select" data-field="stat" aria-label="Slot ${index+1} stat">${pool.map(s=>`<option ${s===e.stat?'selected':''}>${s}</option>`).join('')}</select>
      <strong class="client-total" title="Effective multiplier calculated from quality and all active trait effects">${derived.effectiveMultiplierPct}%</strong>
    </div>
    <div class="client-divider"></div>
    <div class="client-row" data-element="quality">
      <span class="client-kind">TIER</span>
      <select class="client-select" data-field="qualityTier" aria-label="Slot ${index+1} quality">${[1,2,3,4,5].map(t=>`<option value="${t}" ${t===e.qualityTier?'selected':''}>${['I','II','III','IV','V'][t-1]}</option>`).join('')}</select>
      <strong class="client-bonus">+${derived.tierBonusPct}%</strong>
    </div>
    <div class="client-row" data-element="trait" title="${escapeHtml(effects)}">
      <span class="client-kind">TRAIT</span>
      <select class="client-select" data-field="trait" aria-label="Slot ${index+1} trait">${traits.map(t=>`<option value="${t}" ${t===e.trait?'selected':''}>${t}</option>`).join('')}</select>
      <strong class="client-bonus">${signedPct(derived.traitModifierPct)}</strong>
    </div>
  </div>`;
}
function bannerColumn(role:Role):string{
  const b=board[role],players=attachedPlayerLabel(b.selectedTeam,role);
  return `<section class="banner" data-banner-role="${role}"><div class="banner-head"><div class="role-heading"><span>${role.toUpperCase()}</span><small>${role==='mid'?'position 2':'fixed same-team pair'}</small></div><label class="series-control">EXPECTED SERIES<input class="series" data-role="${role}" type="number" min="1" max="8" value="${b.expectedSeries}"></label></div>
    <div class="team-picker"><label>TEAM<select class="team-select" data-role="${role}">${teamOptions(role,b.selectedTeam)}</select></label><div class="attached-players"><span>ATTACHED PLAYER${role==='mid'?'':'S'}</span><b>${escapeHtml(players)}</b></div></div>
    <div class="emblems">${card(role,b,0)}${card(role,b,1)}${card(role,b,2)}</div><div id="selected-${role}" class="roster"><span>MODELED RETAINED ROLE</span><b>Run Optimizer to refresh</b></div></section>`;
}
function opEditor(op:OfferedOperation,i:number):string{
  const selectedElsewhere=new Set(menu.filter((_,j)=>j!==i).map(x=>x.id));
  const options=ACTION_CATALOG.map(action=>`<option value="${action.id}" ${action.id===op.id?'selected':''} ${selectedElsewhere.has(action.id)?'disabled':''}>${escapeHtml(action.label)}</option>`).join('');
  return `<article class="op-card" data-op="${i}"><div class="op-card-head"><span class="op-number">${i+1}</span><div><select class="op-select" data-opfield="action" aria-label="Action ${i+1}">${options}</select></div><span class="op-recommended" aria-hidden="true">RECOMMENDED</span></div><div class="op-results" data-opresult="${i}"><div class="op-empty">Run the optimizer to compare legal targets and reroll outcomes.</div></div></article>`;
}
function syncStateFromDom(){
  document.querySelectorAll<HTMLElement>('.emblem').forEach(el=>{const role=el.dataset.role as Role,index=Number(el.dataset.index) as 0|1|2,e=board[role].emblems[index];el.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]').forEach(input=>{const f=input.dataset.field!;if(f==='stat')e.stat=input.value as StatName;else if(f==='qualityTier')e.qualityTier=Number(input.value) as 1|2|3|4|5;else if(f==='trait')e.trait=input.value as TraitName;});});
  document.querySelectorAll<HTMLInputElement>('.series').forEach(x=>board[x.dataset.role as Role].expectedSeries=Math.max(1,Number(x.value)||1));
  document.querySelectorAll<HTMLSelectElement>('.team-select').forEach(x=>board[x.dataset.role as Role].selectedTeam=x.value);
  tokens=Math.max(0,Number($<HTMLInputElement>('#tokens').value)||0);username=$<HTMLInputElement>('#username').value||'[Username]';targetScore=Math.max(0,Number($<HTMLInputElement>('#target').value)||0);objective=$<HTMLSelectElement>('#objective').value as OptimizerState['objective'];
}
function state():OptimizerState{const s:OptimizerState={board,tokensRemaining:tokens,menu,menuRerollAvailable:true,username,objective};if(targetScore>0)s.targetScore=targetScore;return s;}
function percentileSorted(a:number[],q:number):number{if(!a.length)return 0;const p=(a.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p),w=p-lo;return (a[lo]??0)*(1-w)+(a[hi]??0)*w;}
function percentileLocal(values:number[],q:number):number{return percentileSorted([...values].sort((x,y)=>x-y),q);}
function renderComparisonTabs(){
  $('#comparison-tabs').innerHTML=roles.map(role=>`<button data-compare="${role}" class="${role===comparisonRole?'active':''}">${role.toUpperCase()}</button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-compare]').forEach(b=>b.addEventListener('click',()=>{comparisonRole=b.dataset.compare as Role;renderTeamComparison(comparisonRole);renderComparisonTabs();}));
}
function renderTeamComparison(role:Role){
  const rows=rankTeamsForRole(role,board,data,data.simulation.rankingIterations);
  const stats=rows.map(r=>{const sorted=[...r.samples].sort((a,b)=>a-b);return {row:r,p10:percentileSorted(sorted,.1),p50:percentileSorted(sorted,.5),p90:percentileSorted(sorted,.9)};});
  const selectedExpected=rows.find(r=>r.team===board[role].selectedTeam)?.expected??0;
  const lo=stats.length?Math.min(...stats.map(x=>x.p10)):0,hi=stats.length?Math.max(...stats.map(x=>x.p90)):1,span=Math.max(hi-lo,1);
  const pos=(x:number)=>Math.max(0,Math.min(100,(x-lo)/span*100));
  $('#team-comparisons').innerHTML=`<article class="team-chart"><div class="team-chart-head"><div><b>${role.toUpperCase()}</b><small>Retained-role distribution · ${data.simulation.rankingIterations.toLocaleString()} simulations/team</small></div><div class="team-scale"><span>${fmt(lo)}</span><span>P10 — expected — P90</span><span>${fmt(hi)}</span></div></div>
    <div class="team-interval-head"><span>TEAM / ATTACHED PLAYERS</span><span>LIKELY RANGE</span><span>EXPECTED</span><span>Δ SELECTED</span></div>
    <div class="team-intervals">${stats.map(({row:r,p10,p50,p90},rankIndex)=>{const selected=r.team===board[role].selectedTeam,best=rankIndex===0,delta=r.expected-selectedExpected,left=pos(p10),right=pos(p90),mid=pos(r.expected);return `<div class="team-interval-row ${selected?'selected':''} ${best?'best':''}"><div class="team-name" title="${escapeHtml(r.name)}"><b>${escapeHtml(displayTeamName(r.team))}${best?'<em class="best-tag">BEST</em>':''}</b><small>${escapeHtml(attachedPlayerLabel(r.team,role))} · median ${fmt(p50)}</small></div><div class="interval-cell" title="P10 ${fmt(p10)} · Expected ${fmt(r.expected)} · P90 ${fmt(p90)}"><div class="interval-track"><i class="interval-range" style="left:${left.toFixed(2)}%;width:${Math.max(.8,right-left).toFixed(2)}%"></i><i class="interval-dot" style="left:${mid.toFixed(2)}%"></i></div></div><strong>${fmt(r.expected)}</strong><span class="team-delta ${delta>0?'positive':delta<0?'negative':'zero'}">${selected?'SELECTED':`${delta>=0?'+':''}${fmt(delta)}`}</span></div>`;}).join('')}</div></article>`;
}

function utilityDeltaText(delta:number,targetMode:boolean):string{
  return targetMode?`${delta>=0?'+':''}${(delta*100).toFixed(1)} pp`:`${delta>=0?'+':''}${fmt(delta)}`;
}
function utilityText(value:number,targetMode:boolean):string{return targetMode?pct(value):fmt(value);}
function boardRowsForOperation(result:RecommendationResult,operationId:string):ActionEvaluation[]{
  return result.ranking.filter((r):r is ActionEvaluation=>r.action.kind==='board_action'&&r.action.operationId===operationId&&r.status==='evaluated');
}
function rangePosition(value:number,min:number,max:number):number{return max<=min?50:Math.max(0,Math.min(100,(value-min)/(max-min)*100));}
function confidenceExplanation(level:'high'|'medium'|'low'):string{
  if(level==='high')return 'High confidence means the modeled action advantage is robust within the available transition and score model. Normal uncertainty in future match performance still applies.';
  if(level==='low')return 'Low confidence means the recommendation is unusually sensitive to missing data, approximation, or model assumptions. Treat close alternatives as effectively tied.';
  return 'Medium confidence reflects the V1 distribution-aware proxy: empirical team/role stat distributions and cross-stat correlations are modeled, while exact player-game covariance, tournament path, and long-horizon continuation beyond the browser lookahead remain approximations.';
}
function rangeLaneLabel(key:string,position:number,label:string,value:string):string{
  const edge=position<8?'edge-left':position>92?'edge-right':'';
  return `<span class="range-marker-label ${key} ${edge}" style="left:${position.toFixed(2)}%"><small>${label}</small><b>${value}</b></span>`;
}
function affectedIndices(role:Role,op:OfferedOperation):number[]{
  if(!('color' in op))return [0,1,2];
  const matches=board[role].emblems.map((e,i)=>e.color===op.color?i:-1).filter(i=>i>=0);
  if(op.scope==='first_matching')return matches.length?[matches[0]!]:[];
  if(op.scope==='last_matching')return matches.length?[matches[matches.length-1]!]:[];
  // Random matching can strike any matching emblem, so all possible targets are highlighted.
  return matches;
}
function clearRecommendationHighlights(){
  document.querySelectorAll<HTMLElement>('.banner.recommended-target').forEach(el=>el.classList.remove('recommended-target'));
  document.querySelectorAll<HTMLElement>('.client-row.recommended-target-element').forEach(el=>el.classList.remove('recommended-target-element'));
}
function applyRecommendationHighlights(result:RecommendationResult){
  clearRecommendationHighlights();
  const action=result.recommendation.action;if(action.kind!=='board_action')return;
  const banner=document.querySelector<HTMLElement>(`.banner[data-banner-role="${action.banner}"]`);if(!banner)return;
  banner.classList.add('recommended-target');
  const op=ACTION_BY_ID.get(action.operationId);if(!op)return;
  const element=op.kind==='stat_reroll'?'stat':op.kind==='trait_reroll'?'trait':'quality';
  for(const index of affectedIndices(action.banner,op)){
    banner.querySelector<HTMLElement>(`.emblem[data-index="${index}"] .client-row[data-element="${element}"]`)?.classList.add('recommended-target-element');
  }
}

function renderActionResults(result:RecommendationResult,s:OptimizerState){
  lastResult=result;lastOptimizerState=s;
  const targetMode=s.objective==='target_probability',stopUtility=targetMode?(result.current.targetProbability??0):result.current.expected;
  const allBoardRows=result.ranking.filter(r=>r.action.kind==='board_action'&&r.status==='evaluated');
  const rangeValues:number[]=[0];
  for(const row of allBoardRows){for(const value of [row.outcomeP10Utility,row.outcomeMedianUtility,row.outcomeP90Utility,row.expectedFinalUtility])if(value!==undefined)rangeValues.push(value-stopUtility);}
  let rangeMin=Math.min(...rangeValues),rangeMax=Math.max(...rangeValues);const rawSpan=Math.max(rangeMax-rangeMin,targetMode?.01:100),padding=rawSpan*.08;rangeMin-=padding;rangeMax+=padding;
  const recommended=result.recommendation.action.kind==='board_action'?result.recommendation.action:null;
  menu.forEach((op,i)=>{
    const cardEl=document.querySelector<HTMLElement>(`.op-card[data-op="${i}"]`),resultEl=document.querySelector<HTMLElement>(`[data-opresult="${i}"]`);if(!cardEl||!resultEl)return;
    const rows=boardRowsForOperation(result,op.id).sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility);
    cardEl.classList.remove('recommended');
    if(!rows.length){resultEl.innerHTML='<div class="op-empty">No legal banner target for this action on the current board.</div>';return;}
    const best=rows[0]!,legalRoles=rows.map(r=>(r.action.kind==='board_action'?r.action.banner:'core'));
    let selectedRole=actionTargetSelection.get(i);if(!selectedRole||!legalRoles.includes(selectedRole))selectedRole=best.action.kind==='board_action'?best.action.banner:legalRoles[0]!;actionTargetSelection.set(i,selectedRole);
    const row=rows.find(r=>r.action.kind==='board_action'&&r.action.banner===selectedRole)??best;
    const isRecommended=Boolean(recommended&&recommended.operationId===op.id);if(isRecommended)cardEl.classList.add('recommended');
    const bestRole=best.action.kind==='board_action'?best.action.banner:'core',selected=row.action.kind==='board_action'?row.action.banner:bestRole;
    const delta=row.expectedFinalUtility-stopUtility,p10=(row.outcomeP10Utility??row.expectedFinalUtility)-stopUtility,med=(row.outcomeMedianUtility??row.expectedFinalUtility)-stopUtility,p90=(row.outcomeP90Utility??row.expectedFinalUtility)-stopUtility;
    const zero=rangePosition(0,rangeMin,rangeMax),left=rangePosition(p10,rangeMin,rangeMax),right=rangePosition(p90,rangeMin,rangeMax),median=rangePosition(med,rangeMin,rangeMax),expected=rangePosition(delta,rangeMin,rangeMax);
    const topLane=rangeLaneLabel('p10',left,'P10',utilityDeltaText(p10,targetMode))+rangeLaneLabel('p90',right,'P90',utilityDeltaText(p90,targetMode));
    const medianLane=rangeLaneLabel('median',median,'MEDIAN',utilityDeltaText(med,targetMode));
    const expectedLane=rangeLaneLabel('expected',expected,'EXPECTED',utilityDeltaText(delta,targetMode));
    resultEl.innerHTML=`<div class="op-target-line"><span>BEST TARGET: <b>${bestRole.toUpperCase()}</b></span></div>
      <div class="target-tabs">${roles.map(role=>`<button data-action-target="${i}:${role}" ${legalRoles.includes(role)?'': 'disabled'} class="${role===selected?'active':''}">${role.toUpperCase()}</button>`).join('')}</div>
      <div class="op-metrics"><div class="metric-final"><span>${targetMode?'TARGET PROB.':'EXPECTED FINAL'}</span><b>${utilityText(row.expectedFinalUtility,targetMode)}</b></div><div class="metric-delta"><span>Δ VS STOP</span><b class="${delta>0?'positive':delta<0?'negative':'zero'}">${utilityDeltaText(delta,targetMode)}</b></div><div class="metric-prob"><span>P(IMPROVE)</span><b>${row.pImprove===undefined?'—':`${(row.pImprove*100).toFixed(0)}%`}</b></div></div>
      <div class="op-range"><div class="op-range-head"><span>MODELED REROLL / CONTINUATION OUTCOME Δ VS STOP</span></div><div class="action-range-diagram" title="0 = current setup · P10 ${utilityDeltaText(p10,targetMode)} · Median ${utilityDeltaText(med,targetMode)} · Expected ${utilityDeltaText(delta,targetMode)} · P90 ${utilityDeltaText(p90,targetMode)}"><div class="range-label-lanes"><div class="range-label-lane range-top-lane">${topLane}</div><div class="range-label-lane range-middle-lane">${medianLane}</div><div class="range-label-lane range-lower-lane">${expectedLane}</div></div><div class="action-range-track"><i class="action-zero" style="left:${zero.toFixed(2)}%"></i><i class="action-range" style="left:${Math.min(left,right).toFixed(2)}%;width:${Math.max(.8,Math.abs(right-left)).toFixed(2)}%"></i><i class="action-p10" style="left:${left.toFixed(2)}%"></i><i class="action-p90" style="left:${right.toFixed(2)}%"></i><i class="action-median" style="left:${median.toFixed(2)}%"></i><i class="action-expected" style="left:${expected.toFixed(2)}%"></i></div><div class="range-bottom"><span class="range-worse">WORSE</span><span class="range-zero" style="left:${zero.toFixed(2)}%">0</span><span class="range-better">BETTER</span></div></div></div>`;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action-target]').forEach(button=>button.addEventListener('click',()=>{const [iText,role]=button.dataset.actionTarget!.split(':');actionTargetSelection.set(Number(iText),role as Role);if(lastResult&&lastOptimizerState)renderActionResults(lastResult,lastOptimizerState);}));
  applyRecommendationHighlights(result);
}
function clearActionResults(message='Run the optimizer to compare legal targets and reroll outcomes.'){
  lastResult=null;lastOptimizerState=null;actionTargetSelection.clear();document.querySelectorAll<HTMLElement>('.op-card').forEach(card=>card.classList.remove('recommended'));document.querySelectorAll<HTMLElement>('.op-results').forEach(el=>el.innerHTML=`<div class="op-empty">${escapeHtml(message)}</div>`);
  $('#menu-option')?.classList.remove('recommended');$('#stop-option')?.classList.remove('recommended');clearRecommendationHighlights();
  const next=$<HTMLButtonElement>('#next-roll');if(next)next.disabled=true;
}
function markStale(preserveComparison=false){
  $('#calc-status').textContent='Setup changed — Run Optimizer to refresh the selected setup';
  $('#rec-action').textContent='Setup changed';$('#rec-note').textContent='Run Optimizer to refresh the score distribution and evaluate the next move.';
  $('#rec-confidence').textContent='—';$('#confidence-tooltip').textContent='Confidence explanation will appear after optimization.';$('#menu-ev').textContent='—';$('#menu-delta').textContent='—';$('#stop-ev').textContent='—';
  clearActionResults();
  $('#ranking').innerHTML='<div class="ranking-empty">Setup changed — run the optimizer again to refresh the full decision ranking.</div>';
  if(!preserveComparison)$('#team-comparisons').innerHTML='<div class="loading-inline">Banner setup changed — run the optimizer to refresh this team comparison.</div>';
}
function runSelected(refreshComparison=true):Promise<boolean>{
  syncStateFromDom();document.body.classList.add('busy');$('#calc-status').textContent='Calculating selected setup…';
  return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>{
    try{
      const selected=evaluateSelectedBoard(board,username,data,targetScore>0?targetScore:undefined);
      const finite=selected.samples.filter(Number.isFinite);
      if(finite.length!==selected.samples.length||!finite.some(x=>x>0))throw new Error('The simulation produced no positive finite scores. The statistical model did not map correctly to the selected banner.');
      $('#score-expected').textContent=fmt(selected.expected);$('#score-median').textContent=fmt(selected.median);$('#score-range').textContent=`${fmt(selected.p10)} – ${fmt(selected.p90)}`;$('#score-target').textContent=targetScore>0?pct(selected.targetProbability):'—';
      $('#target-metric').classList.toggle('inactive',targetScore<=0);$('#target-metric').setAttribute('aria-hidden',targetScore<=0?'true':'false');
      const titlePrefix=selected.title.prefix?.label??'—',titleSuffix=selected.title.suffix?.label??'—';
      $('#title-rec').innerHTML=`<span class="title-prefix">${escapeHtml(titlePrefix)}</span> <span class="title-user">${escapeHtml(username||'[Username]')}</span> <span class="title-suffix" tabindex="0">the ${escapeHtml(titleSuffix)}<span class="title-tooltip">${escapeHtml(selected.title.suffixExplainer??'')}</span></span>`;
      $('#title-note').textContent=`Expected prefix gain ≈ ${fmt(selected.title.expectedBonus)} · Core +${selected.title.roleBoostPct.core.toFixed(1)}% · Mid +${selected.title.roleBoostPct.mid.toFixed(1)}% · Support +${selected.title.roleBoostPct.support.toFixed(1)}%`;
      for(const role of roles){const row=selected.roster[role][0];$(`#selected-${role}`).innerHTML=row?`<span>MODELED RETAINED ROLE</span><b>${fmt(row.expected)}</b><small>${escapeHtml(displayTeamName(row.team))} · ${escapeHtml(attachedPlayerLabel(row.team,role))}</small>`:'<b>—</b>';}
      drawHistogram(selected.samples,targetScore,selected.expected,selected.median,selected.p10,selected.p90);if(refreshComparison){renderTeamComparison(comparisonRole);renderComparisonTabs();}
      $('#calc-status').textContent=`${data.simulation.iterations.toLocaleString()} simulations · top 2 games in each series · best 1 series`;
      resolve(true);
    }catch(error){
      $('#score-expected').textContent='—';$('#score-median').textContent='—';$('#score-range').textContent='—';$('#score-target').textContent='—';
      clearHistogram(`Simulation unavailable: ${String(error)}`);
      $('#calc-status').textContent=`Simulation error: ${String(error)}`;
      resolve(false);
    }finally{document.body.classList.remove('busy');}
  },0)));
}
async function runOptimizer(){
  const button=$<HTMLButtonElement>('#optimize'),started=performance.now();
  button.disabled=true;button.textContent='Recalculating…';$('#rec-action').textContent='Recalculating selected setup…';clearActionResults('Calculating current setup…');
  try{
    const recalculated=await runSelected(false);
    if(!recalculated){
      $('#rec-action').textContent='Optimization unavailable';
      $('#rec-note').textContent='Fix the selected-board simulation error before optimizing the next move.';
      return;
    }
    syncStateFromDom();
    const s=state();
    button.textContent='Optimizing…';$('#rec-action').textContent='Calculating all legal action targets…';
    await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const result=recommendNextAction(s,data,true),rec=result.recommendation,elapsed=performance.now()-started;
    const targetMode=s.objective==='target_probability',stopUtility=targetMode?(result.current.targetProbability??0):result.current.expected,recDelta=rec.expectedFinalUtility-stopUtility;
    renderActionResults(result,s);
    $('#rec-action').textContent=formatAction(rec.action,s);$('#rec-confidence').textContent=rec.confidence.toUpperCase();$('#confidence-tooltip').textContent=confidenceExplanation(rec.confidence);$('#rec-note').textContent=`${rec.note??''}${rec.note?' · ':''}Recalculated + optimized in ${elapsed<1000?`${Math.round(elapsed)} ms`:`${(elapsed/1000).toFixed(2)} s`}.`;
    const menuRow=result.ranking.find(r=>r.action.kind==='menu_reroll'),stopRow=result.ranking.find(r=>r.action.kind==='stop');
    $('#menu-ev').textContent=menuRow?utilityText(menuRow.expectedFinalUtility,targetMode):'—';$('#menu-delta').textContent=menuRow?utilityDeltaText(menuRow.expectedFinalUtility-stopUtility,targetMode):'—';$('#stop-ev').textContent=stopRow?utilityText(stopRow.expectedFinalUtility,targetMode):utilityText(stopUtility,targetMode);
    $('#menu-option').classList.toggle('recommended',rec.action.kind==='menu_reroll');$('#stop-option').classList.toggle('recommended',rec.action.kind==='stop');
    const next=$<HTMLButtonElement>('#next-roll');next.disabled=s.tokensRemaining<=0;next.textContent=s.tokensRemaining>0?'Next Roll (-1 Token)':'No Tokens Remaining';
    const metricHead=targetMode?'P≥TARGET':'EXPECTED FINAL',deltaHead='Δ VS STOP',lastHead=targetMode?'P(OBJECTIVE ↑)':'P(BOARD EV ↑)';
    $('#ranking').innerHTML=`<div class="rank-head"><span>#</span><span>ACTION</span><span>${metricHead}</span><span>${deltaHead}</span><span>${lastHead}</span><span>P10 Δ</span><span>P50 Δ</span><span>P90 Δ</span></div>${result.ranking.slice(0,12).map((r,i)=>{const metric=utilityText(r.expectedFinalUtility,targetMode),delta=r.expectedFinalUtility-stopUtility,deltaText=utilityDeltaText(delta,targetMode),last=r.pImprove!==undefined?`${(r.pImprove*100).toFixed(0)}%`:r.confidence.toUpperCase(),p10=(r.outcomeP10Utility??r.expectedFinalUtility)-stopUtility,p50=(r.outcomeMedianUtility??r.expectedFinalUtility)-stopUtility,p90=(r.outcomeP90Utility??r.expectedFinalUtility)-stopUtility;return `<div class="rank-row ${i===0?'best':''}"><i>${i+1}</i><div><b>${formatAction(r.action,s)}</b><small>${r.status.replaceAll('_',' ')}${r.note?` · ${r.note}`:''}</small></div><strong>${r.status==='evaluated'?metric:'—'}</strong><strong class="rank-delta ${delta>0?'positive':delta<0?'negative':'zero'}">${r.status==='evaluated'?deltaText:'—'}</strong><span>${last}</span><strong class="rank-quantile ${p10>0?'positive':p10<0?'negative':'zero'}">${r.status==='evaluated'?utilityDeltaText(p10,targetMode):'—'}</strong><strong class="rank-quantile ${p50>0?'positive':p50<0?'negative':'zero'}">${r.status==='evaluated'?utilityDeltaText(p50,targetMode):'—'}</strong><strong class="rank-quantile ${p90>0?'positive':p90<0?'negative':'zero'}">${r.status==='evaluated'?utilityDeltaText(p90,targetMode):'—'}</strong></div>`;}).join('')}`;
    requestAnimationFrame(()=>setTimeout(()=>{renderTeamComparison(comparisonRole);renderComparisonTabs();},0));
  }catch(error){
    $('#rec-action').textContent='Optimization error';
    $('#rec-note').textContent=String(error);
  }finally{
    button.disabled=false;button.textContent='Run Optimizer';
  }
}
function clearHistogram(message:string){const canvas=$<HTMLCanvasElement>('#hist'),ctx=canvas.getContext('2d')!,rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.max(640,Math.floor(rect.width*dpr));canvas.height=Math.floor(240*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const w=canvas.width/dpr,h=canvas.height/dpr;ctx.clearRect(0,0,w,h);ctx.fillStyle=cssVar('--muted','#aab7c4');ctx.font='13px system-ui';ctx.fillText(message.slice(0,120),18,36);}
function niceStep(span:number,targetTicks=5):number{const rough=Math.max(span/targetTicks,1),power=10**Math.floor(Math.log10(rough)),scaled=rough/power;const nice=scaled<=1?1:scaled<=2?2:scaled<=5?5:10;return nice*power;}
function drawHistogram(samples:number[],target:number,expected:number,median:number,p10:number,p90:number){
  const canvas=$<HTMLCanvasElement>('#hist'),ctx=canvas.getContext('2d')!,rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.max(640,Math.floor(rect.width*dpr));canvas.height=Math.floor(260*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const w=canvas.width/dpr,h=canvas.height/dpr;ctx.clearRect(0,0,w,h);if(!samples.length)return;
  const rawMin=Math.min(...samples),rawMax=Math.max(...samples),span=Math.max(rawMax-rawMin,1),pad=span*.025,min=rawMin-pad,max=rawMax+pad,bins=40,counts=new Array(bins).fill(0);
  for(const x of samples){const j=Math.max(0,Math.min(bins-1,Math.floor((x-min)/(max-min)*bins)));counts[j]++;}
  const peak=Math.max(...counts),left=44,right=18,top=24,bottom=38,plotW=w-left-right,plotH=h-top-bottom,bw=plotW/bins,xPos=(v:number)=>left+(v-min)/(max-min)*plotW;
  ctx.strokeStyle=cssVar('--chart-grid','#33283f');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,h-bottom+.5);ctx.lineTo(w-right,h-bottom+.5);ctx.stroke();
  for(let i=0;i<bins;i++){const bh=(counts[i]/peak)*(plotH-8),binMid=min+(i+.5)/bins*(max-min),tail=target>0&&binMid>=target;ctx.fillStyle=tail?cssVar('--chart-tail','rgba(216,169,63,.72)'):cssVar('--chart-fill','rgba(132,96,181,.78)');ctx.fillRect(left+i*bw+1,h-bottom-bh,Math.max(1,bw-2),bh);}
  const step=niceStep(max-min,5),first=Math.ceil(min/step)*step;ctx.font='11px system-ui';ctx.fillStyle=cssVar('--muted','#aab7c4');ctx.textAlign='center';for(let t=first;t<=max;t+=step){const x=xPos(t);if(x<left+2||x>w-right-2)continue;ctx.strokeStyle=cssVar('--chart-grid','#33283f');ctx.beginPath();ctx.moveTo(x,h-bottom);ctx.lineTo(x,h-bottom+5);ctx.stroke();ctx.fillText(fmt(t),x,h-12);}
  const marker=(value:number,color:string,label:string,dash:number[]=[],labelY=top+10)=>{if(value<min||value>max)return;const x=xPos(value);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='10px system-ui';ctx.textAlign=x>w-100?'right':'left';ctx.fillText(label,x+(x>w-100?-5:5),labelY);ctx.restore();};
  marker(p10,cssVar('--chart-quantile','#8f839d'),'P10',[3,4],top+10);marker(p90,cssVar('--chart-quantile','#8f839d'),'P90',[3,4],top+10);marker(expected,cssVar('--gold','#d8a93f'),'EXPECTED',[6,4],top+10);marker(median,cssVar('--chart-median','#b9a8cc'),'MEDIAN',[2,3],top+23);if(target>0)marker(target,cssVar('--target','#dc8458'),'TARGET',[],top+23);
  ctx.textAlign='left';ctx.fillStyle=cssVar('--muted','#8e9aa7');ctx.font='10px system-ui';ctx.fillText('SIMULATED TOTAL SCORE',left,12);
}

function applyTheme(next:'dark'|'light',recalculate=false){
  theme=next;document.body.dataset.theme=theme;
  try{localStorage.setItem('dota2-fantasy-theme',theme);}catch{}
  const toggle=document.querySelector<HTMLInputElement>('#theme-toggle');
  if(toggle){toggle.checked=theme==='dark';toggle.setAttribute('aria-checked',theme==='dark'?'true':'false');toggle.setAttribute('aria-label',theme==='dark'?'Dark Theme on':'Dark Theme off');}
  if(recalculate&&data)void runSelected(true);
}
function renderStructure(){
  $('#board').innerHTML=roles.map(bannerColumn).join('');$('#ops').innerHTML=menu.map(opEditor).join('');renderComparisonTabs();bindDynamic();
}
function bindDynamic(){
  document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('.emblem input,.emblem select,.series').forEach(x=>x.addEventListener('change',()=>{syncStateFromDom();renderStructure();markStale(false);}));
  document.querySelectorAll<HTMLSelectElement>('.team-select').forEach(x=>x.addEventListener('change',()=>{const changedRole=x.dataset.role as Role;syncStateFromDom();renderStructure();markStale(true);if(comparisonRole===changedRole){renderTeamComparison(changedRole);renderComparisonTabs();}}));
  document.querySelectorAll<HTMLElement>('.op-card').forEach(el=>el.querySelectorAll<HTMLSelectElement>('[data-opfield="action"]').forEach(input=>input.addEventListener('change',()=>{const i=Number(el.dataset.op),next=ACTION_BY_ID.get(input.value);if(next)menu[i]=cloneAction(next);renderStructure();markStale(true);})));
}
function advanceToNextRoll(){
  syncStateFromDom();if(tokens<=0)return;tokens=Math.max(0,tokens-1);$<HTMLInputElement>('#tokens').value=String(tokens);markStale(true);$('#rec-action').textContent='Enter the realized board + new three actions';$('#rec-note').textContent='One roll token was deducted. Update the changed banner, replace the three offers with the new in-game menu, then run the optimizer again.';window.scrollTo({top:0,behavior:'smooth'});
}
function equivalentTeam(sourceTeam:string,role:Role):string|undefined{const target=rosterForTeam(sourceTeam)?.canonical;if(!target)return data.players.find(p=>p.role===role&&p.team===sourceTeam)?.team;return data.players.find(p=>p.role===role&&rosterForTeam(p.team)?.canonical===target)?.team;}
function normalizeSelectedTeams(){for(const role of roles){const current=board[role].selectedTeam;board[role].selectedTeam=equivalentTeam(current,role)??data.players.find(p=>p.role===role)?.team??current;}}
export function mount(){
  try{const saved=localStorage.getItem('dota2-fantasy-theme');if(saved==='light'||saved==='dark')theme=saved;}catch{}
  applyTheme(theme,false);
  $('#board').innerHTML='<section class="loading-panel"><b>Loading tournament model…</b><small>Loading team/role distributions and attached rosters.</small></section>';
  $('#ops').innerHTML='<div class="loading-inline">Operations will appear after the tournament model loads.</div>';
  $('#calc-status').textContent='Loading tournament model…';
  ['tokens','username','target','objective'].forEach(id=>$('#'+id).addEventListener('change',()=>markStale(true)));
  $('#optimize').addEventListener('click',()=>{if(data)runOptimizer();});$('#next-roll').addEventListener('click',()=>{if(data)advanceToNextRoll();});
  $<HTMLInputElement>('#theme-toggle').addEventListener('change',event=>applyTheme((event.currentTarget as HTMLInputElement).checked?'dark':'light',true));
  $('#reset').addEventListener('click',()=>{
    board=structuredClone(defaultBoard);menu=structuredClone(defaultMenu);tokens=10;$<HTMLInputElement>('#tokens').value='10';
    if(data){normalizeSelectedTeams();renderStructure();runSelected();}
  });
  void loadStatisticalModel().then(bundle=>{
    data=bundle;normalizeSelectedTeams();renderStructure();runSelected();
  }).catch(err=>{
    $('#board').innerHTML='<section class="loading-panel error"><b>Tournament model could not be loaded.</b><small>Refresh the page or check the network connection. No synthetic scoring data are being substituted.</small></section>';
    $('#ops').innerHTML='';
    $('#calc-status').textContent=`Tournament model load failed: ${String(err)}`;
  });
}
