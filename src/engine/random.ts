export class SeededRandom {
  private state: number;
  private spare: number | null = null;
  constructor(seed: number) { this.state = (seed >>> 0) || 1; }
  uniform(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return (this.state + 0.5) / 4294967296;
  }
  normal(): number {
    if (this.spare !== null) { const z = this.spare; this.spare = null; return z; }
    const u1 = Math.max(1e-12, this.uniform());
    const u2 = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    this.spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  }
}

export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

export function cholesky3(matrix: number[][]): number[][] {
  const L = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i]?.[j] ?? (i === j ? 1 : 0);
      for (let k = 0; k < j; k++) sum -= (L[i]?.[k] ?? 0) * (L[j]?.[k] ?? 0);
      if (i === j) L[i]![j] = Math.sqrt(Math.max(sum, 1e-9));
      else L[i]![j] = sum / Math.max(L[j]?.[j] ?? 1, 1e-9);
    }
  }
  return L;
}


export function cholesky(matrix:number[][]):number[][]{
  const n=matrix.length,L=Array.from({length:n},()=>new Array<number>(n).fill(0));
  for(let i=0;i<n;i++){
    for(let j=0;j<=i;j++){
      let sum=matrix[i]?.[j]??(i===j?1:0);
      for(let k=0;k<j;k++)sum-=L[i]![k]!*L[j]![k]!;
      if(i===j)L[i]![j]=Math.sqrt(Math.max(sum,1e-8));
      else L[i]![j]=sum/Math.max(L[j]![j]!,1e-8);
    }
  }
  return L;
}

export function correlatedUniformsPrepared(rng:SeededRandom,L:number[][]):[number,number,number]{
  const z0=rng.normal(),z1=rng.normal(),z2=rng.normal();
  const x0=(L[0]?.[0]??0)*z0;
  const x1=(L[1]?.[0]??0)*z0+(L[1]?.[1]??0)*z1;
  const x2=(L[2]?.[0]??0)*z0+(L[2]?.[1]??0)*z1+(L[2]?.[2]??0)*z2;
  return [normalCdf(x0),normalCdf(x1),normalCdf(x2)];
}

export function correlatedUniforms(rng: SeededRandom, correlation: number[][]): [number, number, number] {
  return correlatedUniformsPrepared(rng,cholesky3(correlation));
}
