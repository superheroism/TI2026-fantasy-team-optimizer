from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def cache_pass() -> None:
    path = Path('src/engine/optimizer.ts')
    text = path.read_text()

    text = replace_once(text,
"""  readonly targetedActionCacheHits:number;\n  readonly targetedActionCacheMisses:number;\n  readonly targetedActionEntries:number;\n  readonly targetedActionRequestsByDepth:Readonly<Record<string,number>>;\n  readonly targetedActionCacheHitsByDepth:Readonly<Record<string,number>>;\n  readonly targetedActionCacheMissesByDepth:Readonly<Record<string,number>>;\n  readonly transitionDistributionCacheHits:number;\n  readonly transitionDistributionCacheMisses:number;\n  readonly transitionDistributionEntries:number;\n""",
"""  readonly targetedActionCacheHits:number;\n  readonly targetedActionCacheMisses:number;\n  readonly targetedActionCacheBypasses:number;\n  readonly targetedActionEntries:number;\n  readonly targetedActionRequestsByDepth:Readonly<Record<string,number>>;\n  readonly targetedActionCacheHitsByDepth:Readonly<Record<string,number>>;\n  readonly targetedActionCacheMissesByDepth:Readonly<Record<string,number>>;\n  readonly targetedActionCacheBypassesByDepth:Readonly<Record<string,number>>;\n  readonly transitionDistributionCacheHits:number;\n  readonly transitionDistributionCacheMisses:number;\n  readonly transitionDistributionCacheBypasses:number;\n  readonly transitionDistributionEntries:number;\n""", 'diagnostic interface')

    text = replace_once(text,
"""  targetedActionCacheHits:0,targetedActionCacheMisses:0,targetedActionEntries:0,\n  targetedActionRequestsByDepth:{},targetedActionCacheHitsByDepth:{},targetedActionCacheMissesByDepth:{},\n  transitionDistributionCacheHits:0,transitionDistributionCacheMisses:0,transitionDistributionEntries:0,\n""",
"""  targetedActionCacheHits:0,targetedActionCacheMisses:0,targetedActionCacheBypasses:0,targetedActionEntries:0,\n  targetedActionRequestsByDepth:{},targetedActionCacheHitsByDepth:{},targetedActionCacheMissesByDepth:{},targetedActionCacheBypassesByDepth:{},\n  transitionDistributionCacheHits:0,transitionDistributionCacheMisses:0,transitionDistributionCacheBypasses:0,transitionDistributionEntries:0,\n""", 'empty diagnostics')

    text = replace_once(text,
"""    targetedActionCacheHitsByDepth:{...lastEngineDiagnostics.targetedActionCacheHitsByDepth},\n    targetedActionCacheMissesByDepth:{...lastEngineDiagnostics.targetedActionCacheMissesByDepth},\n""",
"""    targetedActionCacheHitsByDepth:{...lastEngineDiagnostics.targetedActionCacheHitsByDepth},\n    targetedActionCacheMissesByDepth:{...lastEngineDiagnostics.targetedActionCacheMissesByDepth},\n    targetedActionCacheBypassesByDepth:{...lastEngineDiagnostics.targetedActionCacheBypassesByDepth},\n""", 'diagnostic clone')

    text = replace_once(text,
"""  const transitionMemo=new Map<string,readonly EngineTransition[]>();\n  let transitionDistributionCacheHits=0,transitionDistributionCacheMisses=0;\n  const transitionsFor=(engine:EngineState,role:Role,operation:OfferedOperation):readonly EngineTransition[]=>{\n    const key=`${engine.id}|${role}|${operation.id}`;\n    const prior=transitionMemo.get(key);if(prior){transitionDistributionCacheHits++;return prior;}\n    transitionDistributionCacheMisses++;\n    const outcomes=enumerateEngineOperation(engine,role,operation,uniformStatFallback);\n    transitionMemo.set(key,outcomes);return outcomes;\n  };\n\n  const targetedMemo=new Map<string,TargetedContinuation>();\n  let targetedActionCacheHits=0,targetedActionCacheMisses=0;\n  const targetedActionRequestsByDepth=new Map<number,number>();\n  const targetedActionCacheHitsByDepth=new Map<number,number>();\n  const targetedActionCacheMissesByDepth=new Map<number,number>();\n""",
"""  // The compact transition layer already caches by the affected banner mechanics. Retaining\n  // whole-board fresh-menu distributions here duplicates hundreds of thousands of one-use\n  // entries at t=3, so only current-menu/visible distributions are retained run-locally.\n  const transitionMemo=new Map<string,readonly EngineTransition[]>();\n  let transitionDistributionCacheHits=0,transitionDistributionCacheMisses=0,transitionDistributionCacheBypasses=0;\n  const transitionsFor=(engine:EngineState,role:Role,operation:OfferedOperation,retain=true):readonly EngineTransition[]=>{\n    if(!retain){transitionDistributionCacheBypasses++;return enumerateEngineOperation(engine,role,operation,uniformStatFallback);}\n    const key=`${engine.id}|${role}|${operation.id}`;\n    const prior=transitionMemo.get(key);if(prior){transitionDistributionCacheHits++;return prior;}\n    transitionDistributionCacheMisses++;\n    const outcomes=enumerateEngineOperation(engine,role,operation,uniformStatFallback);\n    transitionMemo.set(key,outcomes);return outcomes;\n  };\n\n  // Fresh-menu action values are already memoized by FiniteHorizonValueFunction. A second\n  // targeted cache had essentially zero reuse while retaining ~400k entries at t=3.\n  const targetedMemo=new Map<string,TargetedContinuation>();\n  let targetedActionCacheHits=0,targetedActionCacheMisses=0,targetedActionCacheBypasses=0;\n  const targetedActionRequestsByDepth=new Map<number,number>();\n  const targetedActionCacheHitsByDepth=new Map<number,number>();\n  const targetedActionCacheMissesByDepth=new Map<number,number>();\n  const targetedActionCacheBypassesByDepth=new Map<number,number>();\n""", 'cache declarations')

    text = replace_once(text,
"""    incrementDepth(targetedActionRequestsByDepth,tokensRemaining);\n    const key=`${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}`;\n    const prior=targetedMemo.get(key);\n    if(prior){targetedActionCacheHits++;incrementDepth(targetedActionCacheHitsByDepth,tokensRemaining);return prior;}\n    targetedActionCacheMisses++;incrementDepth(targetedActionCacheMissesByDepth,tokensRemaining);\n    incrementDepth(transitionEvaluationsByDepth,tokensRemaining);\n    const exact=transitionsFor(engine,role,operation);\n    if(!exact.length){const empty={value:-Infinity,utilityOutcomes:[]};targetedMemo.set(key,empty);return empty;}\n""",
"""    incrementDepth(targetedActionRequestsByDepth,tokensRemaining);\n    const retain=phase==='current_menu';\n    const key=retain?`${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}`:'';\n    if(retain){\n      const prior=targetedMemo.get(key);\n      if(prior){targetedActionCacheHits++;incrementDepth(targetedActionCacheHitsByDepth,tokensRemaining);return prior;}\n      targetedActionCacheMisses++;incrementDepth(targetedActionCacheMissesByDepth,tokensRemaining);\n    }else{\n      targetedActionCacheBypasses++;incrementDepth(targetedActionCacheBypassesByDepth,tokensRemaining);\n    }\n    incrementDepth(transitionEvaluationsByDepth,tokensRemaining);\n    const exact=transitionsFor(engine,role,operation,retain);\n    if(!exact.length){const empty={value:-Infinity,utilityOutcomes:[]};if(retain)targetedMemo.set(key,empty);return empty;}\n""", 'targeted cache lookup')

    text = replace_once(text,
"""    let value=0;\n    const utilityOutcomes:{value:number;probability:number}[]=[];\n    for(const outcome of modeled){\n      const continuation=valueFunction.V(outcome.nextState,tokensRemaining-1);\n      value+=outcome.probability*continuation;\n      utilityOutcomes.push({value:continuation,probability:outcome.probability});\n    }\n    const result={value,utilityOutcomes};targetedMemo.set(key,result);return result;\n""",
"""    let value=0;\n    const utilityOutcomes:{value:number;probability:number}[]=[];\n    for(const outcome of modeled){\n      const continuation=valueFunction.V(outcome.nextState,tokensRemaining-1);\n      value+=outcome.probability*continuation;\n      // Fresh-menu callers consume only the scalar value; avoid allocating distributions\n      // that would immediately become garbage on hundreds of thousands of action states.\n      if(retain)utilityOutcomes.push({value:continuation,probability:outcome.probability});\n    }\n    const result={value,utilityOutcomes};if(retain)targetedMemo.set(key,result);return result;\n""", 'targeted result retention')

    text = replace_once(text,
"""    targetedActionCacheHits,\n    targetedActionCacheMisses,\n    targetedActionEntries:targetedMemo.size,\n    targetedActionRequestsByDepth:depthRecord(targetedActionRequestsByDepth),\n    targetedActionCacheHitsByDepth:depthRecord(targetedActionCacheHitsByDepth),\n    targetedActionCacheMissesByDepth:depthRecord(targetedActionCacheMissesByDepth),\n    transitionDistributionCacheHits,\n    transitionDistributionCacheMisses,\n    transitionDistributionEntries:transitionMemo.size,\n""",
"""    targetedActionCacheHits,\n    targetedActionCacheMisses,\n    targetedActionCacheBypasses,\n    targetedActionEntries:targetedMemo.size,\n    targetedActionRequestsByDepth:depthRecord(targetedActionRequestsByDepth),\n    targetedActionCacheHitsByDepth:depthRecord(targetedActionCacheHitsByDepth),\n    targetedActionCacheMissesByDepth:depthRecord(targetedActionCacheMissesByDepth),\n    targetedActionCacheBypassesByDepth:depthRecord(targetedActionCacheBypassesByDepth),\n    transitionDistributionCacheHits,\n    transitionDistributionCacheMisses,\n    transitionDistributionCacheBypasses,\n    transitionDistributionEntries:transitionMemo.size,\n""", 'final diagnostics')

    path.write_text(text)


def scoring_pass() -> None:
    scoring = Path('src/engine/scoring.ts')
    text = scoring.read_text()
    text = replace_once(text,
"""import { bannerMechanicsKey } from './bannerMechanics.js';\n""",
"""import { bannerMechanicsKey } from './bannerMechanics.js';\nimport { decodeBannerState } from './stateEncoding.js';\nimport type { BannerStateID, BoardAdapterContext, EngineState } from './stateEncoding.js';\n""", 'scoring imports')

    marker = "/** Fast scalar evaluator for optimizer search. It is mathematically equivalent for expected-score\n"
    helper = """export interface EngineExpectedScorerDiagnostics {\n  readonly bannerMaterializations:number;\n  readonly bannerCacheEntries:number;\n  readonly bannerCacheHits:number;\n  readonly bannerCacheMisses:number;\n}\n\nexport interface EngineExpectedScorer {\n  evaluate(state:EngineState):number;\n  getDiagnostics():EngineExpectedScorerDiagnostics;\n}\n\n/**\n * Compact-state expected-score evaluator for the DP hot path. BoardState remains the descriptive\n * boundary, but unchanged role-local banner IDs can now reuse the existing role-prefix frontier\n * directly without materializing every cross-role board combination.\n */\nexport function createEngineExpectedScorer(\n  context:BoardAdapterContext,\n  data:DataBundle,\n  iterations=data.simulation.optimizerIterations,\n):EngineExpectedScorer {\n  const memo:Record<Role,Map<BannerStateID,RolePrefixFrontierEntry[]>>={\n    core:new Map(),mid:new Map(),support:new Map(),\n  };\n  const bannerMemo:Record<Role,Map<BannerStateID,BannerState>>={\n    core:new Map(),mid:new Map(),support:new Map(),\n  };\n  let bannerMaterializations=0,bannerCacheHits=0,bannerCacheMisses=0;\n\n  const bannerFor=(role:Role,id:BannerStateID):BannerState=>{\n    const prior=bannerMemo[role].get(id);if(prior)return prior;\n    const banner=decodeBannerState(role,id,context[role]);\n    bannerMemo[role].set(id,banner);bannerMaterializations++;return banner;\n  };\n  const frontierFor=(role:Role,id:BannerStateID):RolePrefixFrontierEntry[]=>{\n    const prior=memo[role].get(id);\n    if(prior){bannerCacheHits++;return prior;}\n    bannerCacheMisses++;\n    const frontier=rolePrefixFrontier(role,bannerFor(role,id),data,iterations);\n    memo[role].set(id,frontier);return frontier;\n  };\n\n  const evaluate=(state:EngineState):number=>{\n    const frontiers={\n      core:frontierFor('core',state.core),\n      mid:frontierFor('mid',state.mid),\n      support:frontierFor('support',state.support),\n    };\n    let best=-Infinity;\n    for(const prefix of data.titles.prefixes){\n      let total=0,complete=true;\n      for(const role of ROLES){const entry=frontiers[role].find(x=>x.prefixId===prefix.id);if(!entry){complete=false;break;}total+=entry.adjustedExpected;}\n      if(complete&&total>best)best=total;\n    }\n    if(Number.isFinite(best))return best;\n\n    // Preserve the existing no-prefix/incomplete-frontier fallback exactly. This path is not\n    // expected for TI 2026 data, but keeping it makes the compact scorer semantically complete.\n    const board:BoardState={\n      core:bannerFor('core',state.core),\n      mid:bannerFor('mid',state.mid),\n      support:bannerFor('support',state.support),\n    };\n    return ROLES.reduce((sum,role)=>sum+(rankTeamsForRole(role,board,data,iterations)[0]?.expected??0),0);\n  };\n\n  return {\n    evaluate,\n    getDiagnostics:()=>({\n      bannerMaterializations,\n      bannerCacheEntries:ROLES.reduce((sum,role)=>sum+memo[role].size,0),\n      bannerCacheHits,bannerCacheMisses,\n    }),\n  };\n}\n\n"""
    if text.count(marker) != 1:
        raise RuntimeError('engine scorer insertion marker mismatch')
    text = text.replace(marker, helper + marker, 1)
    scoring.write_text(text)

    optimizer = Path('src/engine/optimizer.ts')
    text = optimizer.read_text()
    text = replace_once(text,
"""import { evaluateBoard, evaluateBoardExpectedFast } from './scoring.js';\n""",
"""import { createEngineExpectedScorer, evaluateBoard } from './scoring.js';\n""", 'optimizer scoring import')

    text = replace_once(text,
"""  readonly expectedScalarStates:number;\n  readonly targetScalarStates:number;\n  readonly terminalScoringCalls:number;\n""",
"""  readonly expectedScalarStates:number;\n  readonly targetScalarStates:number;\n  readonly terminalScoringCalls:number;\n  readonly expectedBannerMaterializations:number;\n  readonly expectedBannerCacheEntries:number;\n  readonly expectedBannerCacheHits:number;\n  readonly expectedBannerCacheMisses:number;\n""", 'engine scoring diagnostics interface')

    text = replace_once(text,
"""  expectedScalarStates:0,targetScalarStates:0,terminalScoringCalls:0,\n""",
"""  expectedScalarStates:0,targetScalarStates:0,terminalScoringCalls:0,\n  expectedBannerMaterializations:0,expectedBannerCacheEntries:0,expectedBannerCacheHits:0,expectedBannerCacheMisses:0,\n""", 'engine scoring empty diagnostics')

    text = replace_once(text,
"""  const initialEngine=boardToEngineState(state.board);\n  const boardMemo=new Map<BoardStateID,OptimizerState['board']>([[initialEngine.id,state.board]]);\n""",
"""  const initialEngine=boardToEngineState(state.board);\n  const expectedEngineScorer=createEngineExpectedScorer(context,data,data.simulation.optimizerIterations);\n  const boardMemo=new Map<BoardStateID,OptimizerState['board']>([[initialEngine.id,state.board]]);\n""", 'engine scorer construction')

    text = replace_once(text,
"""    terminalScoringCalls++;\n    const value=evaluateBoardExpectedFast(boardFor(engine),data,data.simulation.optimizerIterations);scalarMemo.set(engine.id,value);return value;\n""",
"""    terminalScoringCalls++;\n    const value=expectedEngineScorer.evaluate(engine);scalarMemo.set(engine.id,value);return value;\n""", 'expected scalar compact scorer')

    text = replace_once(text,
"""  lastEngineDiagnostics={\n    modeledHorizon:horizon,\n    descriptiveBoardMaterializations,\n""",
"""  const expectedScoringDiagnostics=expectedEngineScorer.getDiagnostics();\n  lastEngineDiagnostics={\n    modeledHorizon:horizon,\n    descriptiveBoardMaterializations,\n""", 'scoring diagnostics capture')

    text = replace_once(text,
"""    targetScalarStates:targetMemo.size,\n    terminalScoringCalls,\n""",
"""    targetScalarStates:targetMemo.size,\n    terminalScoringCalls,\n    expectedBannerMaterializations:expectedScoringDiagnostics.bannerMaterializations,\n    expectedBannerCacheEntries:expectedScoringDiagnostics.bannerCacheEntries,\n    expectedBannerCacheHits:expectedScoringDiagnostics.bannerCacheHits,\n    expectedBannerCacheMisses:expectedScoringDiagnostics.bannerCacheMisses,\n""", 'scoring final diagnostics')

    optimizer.write_text(text)


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in {'cache', 'scoring'}:
        raise SystemExit('usage: m5b_apply.py cache|scoring')
    {'cache': cache_pass, 'scoring': scoring_pass}[sys.argv[1]]()
