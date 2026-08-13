import { readFileSync } from 'node:fs';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';

export const rawStatisticalModel = JSON.parse(
  readFileSync(
    new URL('../data/ti2026-statistical-model.json', import.meta.url),
    'utf8',
  ),
);

export const rawTitleModel = JSON.parse(
  readFileSync(
    new URL('../data/ti2026-title-model.json', import.meta.url),
    'utf8',
  ),
);

export function testData(simulationOverrides = {}) {
  const base = convertStatisticalModel(rawStatisticalModel, rawTitleModel);

  return {
    ...base,
    simulation: {
      ...base.simulation,
      ...simulationOverrides,
    },
  };
}