const ROLES = ['core', 'mid', 'support'];
const STATS = [
  'Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills',
  'Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood',
  'Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses',
];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const COLORS = ['red', 'green', 'blue'];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function validRequest(body) {
  return body && typeof body === 'object'
    && typeof body.imageDataUrl === 'string'
    && body.imageDataUrl.startsWith('data:image/')
    && body.teamsByRole && typeof body.teamsByRole === 'object'
    && Array.isArray(body.actions) && body.actions.length > 0;
}

function bannerSchema(teamEnum) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['selectedTeam', 'emblems'],
    properties: {
      selectedTeam: { type: 'string', enum: teamEnum },
      emblems: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['position', 'color', 'stat', 'qualityTier', 'trait'],
          properties: {
            position: { type: 'integer', minimum: 0, maximum: 4 },
            color: { type: 'string', enum: COLORS },
            stat: { type: 'string', enum: STATS },
            qualityTier: { type: 'integer', minimum: 1, maximum: 5 },
            trait: { type: 'string', enum: TRAITS },
          },
        },
      },
    },
  };
}

function responseSchema(body) {
  const actionIds = body.actions.map(action => action.id).filter(id => typeof id === 'string');
  return {
    type: 'object',
    additionalProperties: false,
    required: ['layoutId', 'banners', 'operationIds', 'tokensRemaining', 'fieldConfidence', 'warnings'],
    properties: {
      layoutId: { type: 'string', enum: ['legacy_3', 'expanded_5'] },
      banners: {
        type: 'object',
        additionalProperties: false,
        required: ROLES,
        properties: Object.fromEntries(ROLES.map(role => [role, bannerSchema(body.teamsByRole[role] ?? [])])),
      },
      operationIds: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string', enum: actionIds },
      },
      tokensRemaining: { type: ['integer', 'null'], minimum: 0 },
      fieldConfidence: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'confidence'],
          properties: {
            path: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
}

function outputText(response) {
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function prompt(body) {
  const teams = ROLES.map(role => `${role.toUpperCase()}: ${(body.teamsByRole[role] ?? []).join(' | ')}`).join('\n');
  const actions = body.actions.map(action => `${action.id}: ${action.label}`).join('\n');
  return `Read this Dota 2 TI 2026 Fantasy client screenshot and reconstruct only the visible optimizer state.\n\nDetermine whether every banner has 3 emblems (legacy_3) or 5 emblems (expanded_5). For Core, Mid, and Support read each emblem in canonical position order and return color, stat, quality tier, and trait. Read the selected team for each banner. Read the three offered reroll actions and map each to exactly one supplied action id. Read roll tokens only if visibly shown; otherwise return null.\n\nDo not invent obscured or unreadable values. For each field that is not plainly legible, add a fieldConfidence entry below 0.90 and a warning. Use these exact confidence path forms so the UI can highlight the affected board element: banners.core.selectedTeam, banners.mid.selectedTeam, banners.support.selectedTeam, banners.<role>.emblems.<zero-based-index>.stat, banners.<role>.emblems.<zero-based-index>.qualityTier, banners.<role>.emblems.<zero-based-index>.trait, operationIds.<index>, tokensRemaining, or layoutId. Confidence 0.98+ is reserved for plainly legible fields.\n\nAllowed teams by role:\n${teams}\n\nAllowed action catalogue:\n${actions}\n\nCanonical slot colors are a validation signal, not permission to invent missing cards. The full screenshot is authoritative.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'OPENAI_API_KEY is not configured on the screenshot parser service.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return json(res, 400, { error: 'Request body is not valid JSON.' });
  }
  if (!validRequest(body)) return json(res, 400, { error: 'Invalid screenshot import request.' });
  for (const role of ROLES) {
    if (!Array.isArray(body.teamsByRole[role]) || body.teamsByRole[role].length === 0) return json(res, 400, { error: `Missing ${role} team catalogue.` });
  }

  const schema = responseSchema(body);
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_SCREENSHOT_MODEL || 'gpt-5.6-terra',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt(body) },
          { type: 'input_image', image_url: body.imageDataUrl, detail: 'high' },
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'dota2_fantasy_screenshot_import',
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json(res, 502, { error: 'Vision model request failed.', detail: detail.slice(0, 800) });
  }
  const response = await upstream.json();
  const text = outputText(response);
  if (!text) return json(res, 502, { error: 'Vision model returned no structured output.' });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(res, 502, { error: 'Vision model returned invalid structured output.' });
  }
  if (parsed.tokensRemaining === null) delete parsed.tokensRemaining;
  return json(res, 200, parsed);
}
