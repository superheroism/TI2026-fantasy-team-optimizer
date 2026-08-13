import type { DataBundle, PlayerProfile, QuantilePoint, Role, StatName, TitleCatalog } from '../domain/types.js';
import { attachedPlayers, teamRoleLabel } from './ti2026Rosters.js';

export const LOCAL_STATISTICAL_MODEL_URL='./data/ti2026-statistical-model.json';
export const LOCAL_TITLE_MODEL_URL='./data/ti2026-title-model.json';

type ModelRole='Core'|'Mid'|'Support';
interface ModelStat { k:string; l:string; c:string; }
interface ModelCell { q:number[]; e:number; }
interface ModelRoleData { teams:string[]; stats:ModelStat[]; cells:Record<string,Record<string,ModelCell>>; }
interface ModelCorrelation { stats:string[]; m:number[][]; }
interface StatisticalModelRaw { levels:number[]; roles:Record<ModelRole,ModelRoleData>; gcorr:Record<ModelRole,ModelCorrelation>; }
interface TitleModelRaw extends TitleCatalog { schemaVersion:number; }

const ROLE_MODEL:Record<Role,ModelRole>={core:'Core',mid:'Mid',support:'Support'};
const aliases:Record<StatName,string[]>={
  'Creep Score':['creep score','creep_score'], GPM:['gpm'], Deaths:['deaths'], 'Tower Kills':['tower kills','tower_kills'], Madstone:['madstone','madstone collected','madstone_collected'], Kills:['kills'],
  'Teamfight Participation':['teamfight participation','teamfight_participation'], 'Tormentor Kills':['tormentor kills','tormentor_kills'], 'Roshan Kills':['roshan kills','roshan_kills'], Stuns:['stuns'], 'Courier Kills':['courier kills','courier_kills'], 'First Blood':['first blood','first_blood'],
  Runes:['runes','runes grabbed','runes_grabbed'], Watchers:['watchers','watchers taken','watchers_taken'], 'Wards Placed':['wards placed','observer wards placed','observer ward placed','obs placed','obs_placed','wards_placed'], 'Smokes Used':['smokes used','smokes_used'], 'Camps Stacked':['camps stacked','camps_stacked'], Lotuses:['lotuses','lotuses grabbed','lotuses_grabbed']
};

function norm(s:string):string{return s.toLowerCase().replace(/[^a-z0-9]/g,'');}
function canonicalStat(...candidates:string[]):StatName|undefined{
  const normalized=candidates.map(norm);
  return (Object.keys(aliases) as StatName[]).find(k=>aliases[k].some(a=>normalized.includes(norm(a))));
}

function validateTitleCatalog(titles:TitleModelRaw):void{
  if(titles.schemaVersion!==1)throw new Error('Unsupported title model schema version.');
  if(!Array.isArray(titles.prefixes)||!titles.prefixes.length)throw new Error('Title model has no prefixes.');
  if(!Array.isArray(titles.suffixes)||!titles.suffixes.length)throw new Error('Title model has no suffixes.');
  if(!titles.fixedSuffixId||!titles.suffixes.some(s=>s.id===titles.fixedSuffixId))throw new Error('Title model fixed suffix is invalid.');
  for(const role of ['core','mid','support'] as Role[]){
    const byTeam=titles.prefixBoostPctByRoleTeam?.[role];
    if(!byTeam||!Object.keys(byTeam).length)throw new Error(`Title model contains no ${role} team boosts.`);
    for(const [team,row] of Object.entries(byTeam)){
      for(const prefix of titles.prefixes){
        if(!Number.isFinite(row[prefix.id]))throw new Error(`Title model is missing ${role}/${team}/${prefix.id}.`);
      }
    }
  }
}

export function convertStatisticalModel(raw:StatisticalModelRaw,titles:TitleModelRaw):DataBundle{
  validateTitleCatalog(titles);
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

  // Fail loudly if a schema or naming change produces an unusable model. A visible load
  // error is safer than allowing the application to simulate a zero-filled dataset.
  for(const role of ['core','mid','support'] as Role[]){
    const profiles=players.filter(p=>p.role===role);
    if(!profiles.length)throw new Error(`Statistical model contains no ${role} team profiles.`);
    if(profiles.some(p=>Object.keys(p.statQuantiles).length<3)){
      throw new Error(`Statistical model conversion produced incomplete ${role} stat profiles.`);
    }
    if(!roleCorrelations[role]?.stats.length)throw new Error(`Statistical model is missing ${role} correlations.`);
  }

  return {
    label:'Precomputed team/role distributions',
    isDemo:false,
    sourceUrl:LOCAL_STATISTICAL_MODEL_URL,
    players,
    titles,
    simulation:{iterations:20000,optimizerIterations:48,rankingIterations:6000,seed:20260809,maxLookaheadTokens:2,continuationOutcomeStrata:8,continuationEntryStrata:12,scoring:{retainedGamesPerSeries:2,retainedSeries:1,thirdGameProbability:0.407}},
    roleCorrelations
  };
}

export async function loadStatisticalModel():Promise<DataBundle>{
  const [modelResponse,titleResponse]=await Promise.all([
    fetch(LOCAL_STATISTICAL_MODEL_URL,{cache:'no-store'}),
    fetch(LOCAL_TITLE_MODEL_URL,{cache:'no-store'})
  ]);
  if(!modelResponse.ok)throw new Error(`Local statistical model failed to load: ${modelResponse.status} ${modelResponse.statusText}`);
  if(!titleResponse.ok)throw new Error(`Local title model failed to load: ${titleResponse.status} ${titleResponse.statusText}`);
  const [raw,titles]=await Promise.all([
    modelResponse.json() as Promise<StatisticalModelRaw>,
    titleResponse.json() as Promise<TitleModelRaw>
  ]);
  return convertStatisticalModel(raw,titles);
}

/** Exported only for adapter tests. */
export const statisticalModelAdapterInternals={canonicalStat};
