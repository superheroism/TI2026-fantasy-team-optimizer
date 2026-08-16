from pathlib import Path

p = Path('src/import/emblemOcrRefinement.ts')
s = p.read_text()
s = s.replace("match.score+(hasTier?.08:0)+(bonus?.08:0)", "match.score+(hasTier ? .08 : 0)+(bonus ? .08 : 0)")
s = s.replace("match.score+(TRAITS.some(t=>line.text.toUpperCase().includes(t.toUpperCase()))?.08:0)", "match.score+(TRAITS.some(t=>line.text.toUpperCase().includes(t.toUpperCase())) ? .08 : 0)")
s = s.replace(
"  metrics.diagnostic.refinementEvidence={attempted:true,emblemRetries,teamRetries,footerRetries,elapsedMs:performance.now()-started};\n  return{result:raw,elapsedMs:performance.now()-started,retries};",
"  const elapsedMs=performance.now()-started;\n  const diagnostic=metrics.diagnostic as typeof metrics.diagnostic & {refinementEvidence:{attempted:boolean;emblemRetries:number;teamRetries:number;footerRetries:number;elapsedMs:number}};\n  diagnostic.refinementEvidence={attempted:true,emblemRetries,teamRetries,footerRetries,elapsedMs};\n  // Clear only warnings whose field was actually recovered; unresolved fields remain conservative review items.\n  raw.warnings=(raw.warnings??[]).filter(warning=>{\n    const action=/Action (\\d)/.exec(warning);if(action){const i=Number(action[1])-1;return raw.operationIds[i]===null;}\n    if(/Roll token count/i.test(warning))return raw.tokensRemaining===undefined;\n    return true;\n  });\n  return{result:raw,elapsedMs,retries};"
)
p.write_text(s)
