import type { DataBundle, PlayerProfile, QuantilePoint, Role, StatName, StatisticalDatasetId, TitleCatalog } from '../domain/types.js';
import { attachedPlayers, isMainEventEligibleTeam, teamRoleLabel } from './ti2026Rosters.js';

export interface StatisticalDatasetDefinition {
  id: StatisticalDatasetId;
  label: string;
  modelUrl: string;
  kind: 'correlations';
}

export const DEFAULT_STATISTICAL_DATASET_ID:StatisticalDatasetId='group-stage-correlations';
export const STATISTICAL_DATASETS:Readonly<Record<StatisticalDatasetId,StatisticalDatasetDefinition>>={
  'pre-ti2026-correlations':{
    id:'pre-ti2026-correlations',label:'Group Stage',modelUrl:'./data/ti2026-statistical-model.json',kind:'correlations',
  },
  'group-stage-correlations':{
    id:'group-stage-correlations',label:'Main Event',modelUrl:'./data/ti2026-group-stage-statistical-model.json',kind:'correlations',
  },
};
export const STATISTICAL_DATASET_OPTIONS:readonly StatisticalDatasetDefinition[]=Object.values(STATISTICAL_DATASETS);

export function statisticalDatasetDefinition(id:StatisticalDatasetId=DEFAULT_STATISTICAL_DATASET_ID):StatisticalDatasetDefinition {
  return STATISTICAL_DATASETS[id];
}

export const LOCAL_STATISTICAL_MODEL_URL=STATISTICAL_DATASETS[DEFAULT_STATISTICAL_DATASET_ID].modelUrl;
export const LOCAL_TITLE_MODEL_URL='./data/ti2026-title-model.json';
export const STATISTICAL_MODEL_SCHEMA_ID='ti2026-statistical-model-v1';
export const TITLE_MODEL_SCHEMA_VERSION=1;

type ModelRole='Core'|'Mid'|'Support';
interface ModelStat { k:string; l:string; c:string; }
interface ModelCell { q:number[]; e:number; }
interface ModelRoleData { teams:string[]; stats:ModelStat[]; cells:Record<string,Record<string,ModelCell>>; }
interface ModelCorrelation { stats:string[]; m:number[][]; }
interface StatisticalModelRaw { levels:number[]; roles:Record<ModelRole,ModelRoleData>; gcorr:Record<ModelRole,ModelCorrelation>; }
interface TitleModelRaw extends TitleCatalog { schemaVersion:number; }

const ROLE_MODEL:Record<Role,ModelRole>={core:'Core',mid:'Mid',support:'Support'};
const MODEL_ROLES:readonly ModelRole[]=['Core','Mid','Support'];
const aliases:Record<StatName,string[]>={
  'Creep Score':['creep score','creep_score'], GPM:['gpm'], Deaths:['deaths'], 'Tower Kills':['tower kills','tower_kills'], Madstone:['madstone','madstone collected','madstone_collected'], Kills:['kills'],
  'Teamfight Participation':['teamfight participation','teamfight_participation'], 'Tormentor Kills':['tormentor kills','tormentor_kills'], 'Roshan Kills':['roshan kills','roshan_kills'], Stuns:['stuns'], 'Courier Kills':['courier kills','courier_kills'], 'First Blood':['first blood','first_blood'],
  Runes:['runes','runes grabbed','runes_grabbed'], Watchers:['watchers','watchers taken','watchers_taken'], 'Wards Placed':['wards placed','observer wards placed','observer ward placed','obs placed','obs_placed','wards_placed'], 'Smokes Used':['smokes used','smokes_used'], 'Camps Stacked':['camps stacked','camps_stacked'], Lotuses:['lotuses','lotuses grabbed','lotuses_grabbed']
};

function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function norm(s:string):string{return s.toLowerCase().replace(/[^a-z0-9]/g,'');}
function canonicalStat(...candidates:string[]):StatName|undefined{
  const normalized=candidates.map(norm);
  return (Object.keys(aliases) as StatName[]).find(k=>aliases[k].some(a=>normalized.includes(norm(a))));
}

function validateTitleCatalog(value:unknown):asserts value is TitleModelRaw{
  if(!isRecord(value))throw new Error('Title model schema v1 requires an object.');
  if(value.schemaVersion!==TITLE_MODEL_SCHEMA_VERSION)throw new Error(`Unsupported title model schema version; expected ${TITLE_MODEL_SCHEMA_VERSION}.`);
  if(!Array.isArray(value.prefixes)||!value.prefixes.length)throw new Error('Title model has no prefixes.');
  if(!Array.isArray(value.suffixes)||!value.suffixes.length)throw new Error('Title model has no suffixes.');
  if(typeof value.fixedSuffixId!=='string'||!value.suffixes.some(s=>isRecord(s)&&s.id===value.fixedSuffixId))throw new Error('Title model fixed suffix is invalid.');
  if(!isRecord(value.prefixBoostPctByRoleTeam))throw new Error('Title model role/team boost table is invalid.');
  for(const role of ['core','mid','support'] as Role[]){
    const byTeam=value.prefixBoostPctByRoleTeam[role];
    if(!isRecord(byTeam)||!Object.keys(byTeam).length)throw new Error(`Title model contains no ${role} team boosts.`);
    for(const [team,row] of Object.entries(byTeam)){
      if(!isRecord(row))throw new Error(`Title model contains an invalid ${role}/${team} boost row.`);
      for(const prefix of value.prefixes){
        if(!isRecord(prefix)||typeof prefix.id!=='string'||!Number.isFinite(row[prefix.id]))throw new Error(`Title model is missing ${role}/${team}/${isRecord(prefix)?String(prefix.id):'unknown-prefix'}.`);
      }
    }
  }
}

function validateStatisticalModel(value:unknown):asserts value is StatisticalModelRaw{
  if(!isRecord(value))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} requires an object.`);
  if(!Array.isArray(value.levels)||value.levels.length<2||value.levels.some(x=>!Number.isFinite(x)))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has invalid quantile levels.`);
  if(!isRecord(value.roles)||!isRecord(value.gcorr))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} is missing roles or correlations.`);
  for(const role of MODEL_ROLES){
    const roleData=value.roles[role],correlation=value.gcorr[role];
    if(!isRecord(roleData)||!Array.isArray(roleData.teams)||!roleData.teams.length||roleData.teams.some(x=>typeof x!=='string'))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has invalid ${role} teams.`);
    if(!Array.isArray(roleData.stats)||!roleData.stats.length||!isRecord(roleData.cells))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has invalid ${role} stats/cells.`);
    const statKeys:string[]=[];
    for(const stat of roleData.stats){
      if(!isRecord(stat)||typeof stat.k!=='string'||typeof stat.l!=='string'||typeof stat.c!=='string')throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has an invalid ${role} stat descriptor.`);
      statKeys.push(stat.k);
      const byTeam=roleData.cells[stat.k];
      if(!isRecord(byTeam))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} is missing ${role}/${stat.k} cells.`);
      for(const team of roleData.teams){
        const cell=byTeam[team];
        if(!isRecord(cell)||!Array.isArray(cell.q)||cell.q.length!==value.levels.length||cell.q.some(x=>!Number.isFinite(x))||!Number.isFinite(cell.e))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has an invalid ${role}/${stat.k}/${team} cell.`);
      }
    }
    if(!isRecord(correlation)||!Array.isArray(correlation.stats)||!Array.isArray(correlation.m)||correlation.stats.length!==correlation.m.length)throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has invalid ${role} correlations.`);
    for(const row of correlation.m){if(!Array.isArray(row)||row.length!==correlation.stats.length||row.some(x=>!Number.isFinite(x)))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} has a non-square ${role} correlation matrix.`);}
    if(correlation.stats.some(key=>typeof key!=='string'||!statKeys.includes(key)))throw new Error(`${STATISTICAL_MODEL_SCHEMA_ID} ${role} correlations reference unknown stats.`);
  }
}

export function convertStatisticalModel(raw:unknown,titles:unknown,datasetId:StatisticalDatasetId=DEFAULT_STATISTICAL_DATASET_ID,applyMainEventEligibility=false):DataBundle{
  validateStatisticalModel(raw);validateTitleCatalog(titles);
  const dataset=statisticalDatasetDefinition(datasetId);
  const levels=raw.levels.map(x=>x/100);
  const players:PlayerProfile[]=[];
  const roleCorrelations={} as DataBundle['roleCorrelations'];

  (['core','mid','support'] as Role[]).forEach(role=>{
    const modelRole=ROLE_MODEL[role],roleData=raw.roles[modelRole];
    const rawToCanonical=new Map<string,StatName>();
    roleData.stats.forEach(stat=>{const canonical=canonicalStat(stat.k,stat.l);if(canonical)rawToCanonical.set(stat.k,canonical);});

    roleData.teams.forEach(team=>{
      const statQuantiles:PlayerProfile['statQuantiles']={};
      const effectiveGamesByStat:NonNullable<PlayerProfile['effectiveGamesByStat']>={};
      for(const [rawKey,byTeam] of Object.entries(roleData.cells)){
        const stat=rawToCanonical.get(rawKey),cell=byTeam[team];
        if(!stat||!cell)continue;
        statQuantiles[stat]=cell.q.map((value,i)=>({q:levels[i]??i/Math.max(cell.q.length-1,1),value}) satisfies QuantilePoint);
        effectiveGamesByStat[stat]=cell.e;
      }
      players.push({id:`${role}:${team}`,name:teamRoleLabel(team,role),team,role,attachedPlayers:attachedPlayers(team,role),statQuantiles,effectiveGamesByStat});
    });

    const correlation=raw.gcorr[modelRole];
    const corrStats:StatName[]=[];
    const rawIndices:number[]=[];
    correlation.stats.forEach((key,i)=>{const canonical=rawToCanonical.get(key);if(canonical){corrStats.push(canonical);rawIndices.push(i);}});
    const spearman=rawIndices.map(i=>rawIndices.map(j=>correlation.m[i]?.[j]??0));
    roleCorrelations[role]={stats:corrStats,spearman};
  });

  // Fail loudly if a naming/schema change produces a structurally valid but unusable model.
  for(const role of ['core','mid','support'] as Role[]){
    const profiles=players.filter(p=>p.role===role);
    if(!profiles.length)throw new Error(`Statistical model contains no ${role} team profiles.`);
    if(profiles.some(p=>Object.keys(p.statQuantiles).length<3))throw new Error(`Statistical model conversion produced incomplete ${role} stat profiles.`);
    if(!roleCorrelations[role]?.stats.length)throw new Error(`Statistical model is missing ${role} correlations.`);
  }

  const selectablePlayers=applyMainEventEligibility?players.filter(player=>isMainEventEligibleTeam(player.team)):players;
  if(applyMainEventEligibility){
    for(const role of ['core','mid','support'] as Role[]){
      if(!selectablePlayers.some(player=>player.role===role))throw new Error(`Main Event eligibility produced no selectable ${role} profiles.`);
    }
  }

  return {
    label:'Precomputed team/role distributions',
    isDemo:false,
    sourceUrl:dataset.modelUrl,
    statisticalDatasetId:dataset.id,
    players:selectablePlayers,
    historicalPlayers:players,
    titles,
    simulation:{iterations:20000,optimizerIterations:48,rankingIterations:6000,seed:20260809,maxLookaheadTokens:2,continuationOutcomeStrata:8,continuationEntryStrata:12,scoring:{retainedGamesPerSeries:2,retainedSeries:1,thirdGameProbability:0.407}},
    roleCorrelations
  };
}

export async function loadStatisticalModel(datasetId:StatisticalDatasetId=DEFAULT_STATISTICAL_DATASET_ID):Promise<DataBundle>{
  const dataset=statisticalDatasetDefinition(datasetId);
  const [modelResponse,titleResponse]=await Promise.all([
    fetch(dataset.modelUrl,{cache:'no-store'}),
    fetch(LOCAL_TITLE_MODEL_URL,{cache:'no-store'})
  ]);
  if(!modelResponse.ok)throw new Error(`Local statistical model failed to load: ${modelResponse.status} ${modelResponse.statusText}`);
  if(!titleResponse.ok)throw new Error(`Local title model failed to load: ${titleResponse.status} ${titleResponse.statusText}`);
  const [raw,titles]=await Promise.all([modelResponse.json(),titleResponse.json()]);
  return convertStatisticalModel(raw,titles,datasetId,datasetId==='group-stage-correlations');
}

/** Exported only for adapter/schema tests. */
export const statisticalModelAdapterInternals={canonicalStat,validateStatisticalModel,validateTitleCatalog};
