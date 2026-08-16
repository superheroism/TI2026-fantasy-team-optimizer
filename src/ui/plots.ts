import type { BoardState, DataBundle, Role } from '../domain/types.js';
import { rankTeamsForRole } from '../engine/scoring.js';
import { attachedPlayerLabel, escapeHtml, UI_ROLES } from './boardView.js';
import { displayTeamName } from '../data/ti2026Rosters.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const fmt = (value: number): string => Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';

function percentileSorted(values: number[], q: number): number {
  if (!values.length) return 0;
  const p = (values.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  const weight = p - lo;
  return (values[lo] ?? 0) * (1 - weight) + (values[hi] ?? 0) * weight;
}

export function renderComparisonTabs(role: Role, onChange: (role: Role) => void): void {
  $('#comparison-tabs').innerHTML = UI_ROLES.map(candidate => `<button data-compare="${candidate}" class="${candidate === role ? 'active' : ''}">${candidate.toUpperCase()}</button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-compare]').forEach(button => button.addEventListener('click', () => onChange(button.dataset.compare as Role)));
}

export function renderTeamComparison(role: Role, board: BoardState, data: DataBundle): void {
  const rows = rankTeamsForRole(role, board, data, data.simulation.rankingIterations);
  const stats = rows.map(row => {
    const sorted = [...row.samples].sort((a, b) => a - b);
    return { row, p10: percentileSorted(sorted, .1), p50: percentileSorted(sorted, .5), p90: percentileSorted(sorted, .9) };
  });
  const selectedExpected = rows.find(row => row.team === board[role].selectedTeam)?.expected ?? 0;
  const lo = stats.length ? Math.min(...stats.map(item => item.p10)) : 0;
  const hi = stats.length ? Math.max(...stats.map(item => item.p90)) : 1;
  const span = Math.max(hi - lo, 1);
  const pos = (value: number): number => Math.max(0, Math.min(100, (value - lo) / span * 100));
  $('#team-comparisons').innerHTML = `<article class="team-chart"><div class="team-chart-head"><div><b>${role.toUpperCase()}</b><small>Retained-role distribution · ${data.simulation.rankingIterations.toLocaleString()} simulations/team</small></div><div class="team-scale"><span>${fmt(lo)}</span><span>P10 — expected — P90</span><span>${fmt(hi)}</span></div></div>
    <div class="team-interval-head"><span>TEAM / ATTACHED PLAYERS</span><span>LIKELY RANGE</span><span>EXPECTED</span><span>Δ SELECTED</span></div>
    <div class="team-intervals">${stats.map(({ row, p10, p50, p90 }, rankIndex) => {
      const selected = row.team === board[role].selectedTeam;
      const best = rankIndex === 0;
      const delta = row.expected - selectedExpected;
      const left = pos(p10);
      const right = pos(p90);
      const mid = pos(row.expected);
      return `<div class="team-interval-row ${selected ? 'selected' : ''} ${best ? 'best' : ''}"><div class="team-name" title="${escapeHtml(row.name)}"><b>${escapeHtml(displayTeamName(row.team))}${best ? '<em class="best-tag">BEST</em>' : ''}</b><small>${escapeHtml(attachedPlayerLabel(row.team, role))} · median ${fmt(p50)}</small></div><div class="interval-cell" title="P10 ${fmt(p10)} · Expected ${fmt(row.expected)} · P90 ${fmt(p90)}"><div class="interval-track"><i class="interval-range" style="left:${left.toFixed(2)}%;width:${Math.max(.8, right - left).toFixed(2)}%"></i><i class="interval-dot" style="left:${mid.toFixed(2)}%"></i></div></div><strong>${fmt(row.expected)}</strong><span class="team-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'zero'}">${selected ? 'SELECTED' : `${delta >= 0 ? '+' : ''}${fmt(delta)}`}</span></div>`;
    }).join('')}</div></article>`;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

export function clearHistogram(message: string): void {
  const canvas = $<HTMLCanvasElement>('#hist');
  const ctx = canvas.getContext('2d')!;
  const rect = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(640, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(240 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cssVar('--muted', '#aab7c4');
  ctx.font = '13px system-ui';
  ctx.fillText(message.slice(0, 120), 18, 36);
}

function niceStep(span: number, targetTicks = 5): number {
  const rough = Math.max(span / targetTicks, 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

export function drawHistogram(samples: number[], target: number, expected: number, median: number, p10: number, p90: number): void {
  const canvas = $<HTMLCanvasElement>('#hist');
  const ctx = canvas.getContext('2d')!;
  const rect = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(640, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(260 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);
  if (!samples.length) return;
  const rawMin = Math.min(...samples);
  const rawMax = Math.max(...samples);
  const span = Math.max(rawMax - rawMin, 1);
  const pad = span * .025;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const bins = 40;
  const counts = new Array<number>(bins).fill(0);
  for (const value of samples) {
    const index = Math.max(0, Math.min(bins - 1, Math.floor((value - min) / (max - min) * bins)));
    counts[index]!++;
  }
  const peak = Math.max(...counts);
  const left = 44, right = 18, top = 24, bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const barWidth = plotWidth / bins;
  const xPos = (value: number): number => left + (value - min) / (max - min) * plotWidth;
  ctx.strokeStyle = cssVar('--chart-grid', '#33283f');
  ctx.lineWidth = 1;
  ctx.beginPath();ctx.moveTo(left, height - bottom + .5);ctx.lineTo(width - right, height - bottom + .5);ctx.stroke();
  for (let i = 0; i < bins; i++) {
    const barHeight = (counts[i]! / peak) * (plotHeight - 8);
    const binMid = min + (i + .5) / bins * (max - min);
    ctx.fillStyle = target > 0 && binMid >= target ? cssVar('--chart-tail', 'rgba(216,169,63,.72)') : cssVar('--chart-fill', 'rgba(132,96,181,.78)');
    ctx.fillRect(left + i * barWidth + 1, height - bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
  }
  const step = niceStep(max - min, 5);
  const first = Math.ceil(min / step) * step;
  ctx.font = '11px system-ui';ctx.fillStyle = cssVar('--muted', '#aab7c4');ctx.textAlign = 'center';
  for (let tick = first; tick <= max; tick += step) {
    const x = xPos(tick);if (x < left + 2 || x > width - right - 2) continue;
    ctx.strokeStyle = cssVar('--chart-grid', '#33283f');ctx.beginPath();ctx.moveTo(x, height - bottom);ctx.lineTo(x, height - bottom + 5);ctx.stroke();ctx.fillText(fmt(tick), x, height - 12);
  }
  const marker = (value: number, color: string, label: string, dash: number[] = [], labelY = top + 10): void => {
    if (value < min || value > max) return;
    const x = xPos(value);ctx.save();ctx.strokeStyle = color;ctx.lineWidth = 1.5;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x, top);ctx.lineTo(x, height - bottom);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle = color;ctx.font = '10px system-ui';ctx.textAlign = x > width - 100 ? 'right' : 'left';ctx.fillText(label, x + (x > width - 100 ? -5 : 5), labelY);ctx.restore();
  };
  marker(p10, cssVar('--chart-quantile', '#8f839d'), 'P10', [3, 4], top + 10);
  marker(p90, cssVar('--chart-quantile', '#8f839d'), 'P90', [3, 4], top + 10);
  marker(expected, cssVar('--gold', '#d8a93f'), 'EXPECTED', [6, 4], top + 10);
  marker(median, cssVar('--chart-median', '#b9a8cc'), 'MEDIAN', [2, 3], top + 23);
  if (target > 0) marker(target, cssVar('--target', '#dc8458'), 'TARGET', [], top + 23);
  ctx.textAlign = 'left';ctx.fillStyle = cssVar('--muted', '#8e9aa7');ctx.font = '10px system-ui';ctx.fillText('SIMULATED TOTAL SCORE', left, 12);
}
