// Optional lex integration — loaded dynamically from index.ts inside Hooks.once('ready').
// Only runs when the lex module is active; no-ops silently if it is not.
//
// No imports from lexicon-core are used here. All Lex types are mirrored locally
// as structural interfaces so this file compiles without the lex module present.

import type {
  DicePool,
  DiceResolutionSchema,
  Fortune,
  ResolvedCasusConfig,
  RollContext,
} from '../types/index.js';
import { resolveDynamicValue } from './resolver.js';

// ─── Structural mirrors of lex types ─────────────────────────────────────────
// These match the shapes in lexicon-core/src/types/index.ts. If the lex API
// changes, TypeScript will surface the mismatch at the registerPlugin call.

interface LexRuleFieldDef {
  key:          string;
  label:        string;
  type:         'text' | 'number' | 'select' | 'target' | 'tag' | 'trigger' | 'tier' | 'nested-rule';
  required?:    boolean;
  placeholder?: string;
  options?:     Array<{ value: string; label: string }>;
}

interface LexRuleElement {
  type: string;
  [key: string]: unknown;
}

interface LexRuleContext {
  actor:       unknown;
  tags:        Set<string>;
  triggerType: string;
  rollResult?: { tier: string; [key: string]: unknown };
}

interface LexVocabView {
  targets:      ReadonlyMap<string, { id: string; label: string; path?: string }>;
  tags:         ReadonlyMap<string, { id: string; label: string }>;
  elementTypes: ReadonlyMap<string, LexRuleElementDef>;
  [key: string]: unknown;
}

interface LexEngine {
  collectRules(actor: unknown): LexRuleElement[];
}

interface LexRuleElementDef {
  type:         string;
  label:        string;
  description?: string;
  fields:       LexRuleFieldDef[];
  evaluate(element: LexRuleElement, context: LexRuleContext, engine: LexEngine): void | Promise<void>;
  toSentence(element: LexRuleElement, vocab: LexVocabView, engine?: LexEngine): string;
}

interface LexPlugin {
  systemId:      string;
  ruleTypes?:    LexRuleElementDef[];
  targets?:      Array<{ id: string; label: string; path?: string }>;
  tags?:         Array<{ id: string; label: string }>;
  triggerTypes?: Array<{ id: string; label: string }>;
}

interface LexApiSurface {
  version:        string;
  registerPlugin(plugin: LexPlugin): void;
  getEngine():    LexEngine;
}

// ─── Lex API accessor ─────────────────────────────────────────────────────────

function getLexApi(): LexApiSurface | undefined {
  return game.modules.get<{ api?: LexApiSurface }>('lex')?.api;
}

// ─── Display formatter (no context — used in toSentence only) ─────────────────

function formatBy(val: unknown): string {
  if (typeof val === 'number') return `${val >= 0 ? '+' : ''}${val}`;
  if (typeof val === 'object' && val !== null) {
    if ('ref'     in val) return `+[${String((val as { ref: unknown }).ref)}]`;
    if ('formula' in val) return `+(${String((val as { formula: unknown }).formula)})`;
  }
  return '+?';
}

// ─── Rule element: alea.pool-modifier ────────────────────────────────────────
// Adds a fixed bonus/penalty to the pool modifier before rolling.
// Optional `when` field: a tag ID — rule is skipped unless the roll carries that tag.

const poolModifier: LexRuleElementDef = {
  type:        'alea.pool-modifier',
  label:       'Pool Modifier',
  description: 'Adds a bonus or penalty to the dice pool modifier before rolling.',
  fields: [
    { key: 'by',   label: 'Amount',                  type: 'number', required: true, placeholder: '0' },
    { key: 'when', label: 'Tag condition (optional)', type: 'tag' },
  ],
  evaluate(_element, _context, _engine): void {
    // Applied via the alea.modifyPool Foundry hook — not via standard Lex evaluation.
  },
  toSentence(element, _vocab): string {
    const by   = formatBy(element['by']);
    const when = typeof element['when'] === 'string' ? ` when [${element['when']}]` : '';
    return `${by} to pool modifier${when}`;
  },
};

// ─── Rule element: alea.casus-modifier ───────────────────────────────────────
// Adjusts casus (fortune-die) bonus/penalty thresholds and suppress flags.

const casusModifier: LexRuleElementDef = {
  type:        'alea.casus-modifier',
  label:       'Casus Modifier',
  description: 'Adjusts the casus (fortune die) bonus/penalty thresholds before rolling.',
  fields: [
    {
      key: 'target', label: 'Target', type: 'select', required: true,
      options: [
        { value: 'bonusOn',   label: 'Bonus threshold'   },
        { value: 'penaltyOn', label: 'Penalty threshold' },
      ],
    },
    { key: 'by',       label: 'Adjust by',                type: 'number', required: true, placeholder: '0' },
    {
      key: 'suppress', label: 'Suppress', type: 'select',
      options: [
        { value: '',        label: '—'            },
        { value: 'bonus',   label: 'Bonus only'   },
        { value: 'penalty', label: 'Penalty only' },
        { value: 'both',    label: 'Both'         },
      ],
    },
    { key: 'when', label: 'Tag condition (optional)', type: 'tag' },
  ],
  evaluate(_element, _context, _engine): void {
    // Applied via the alea.resolveCasus Foundry hook.
  },
  toSentence(element, _vocab): string {
    const target   = typeof element['target']   === 'string' ? element['target']   : 'threshold';
    const suppress = typeof element['suppress'] === 'string' ? element['suppress'] : '';
    const by    = formatBy(element['by']);
    const parts: string[] = [];
    if (by !== '+0') parts.push(`${by} to ${target}`);
    if (suppress)  parts.push(`suppress ${suppress}`);
    return parts.length ? parts.join('; ') : 'No adjustment';
  },
};

// ─── Rule element: alea.grant-fortune ────────────────────────────────────────
// Grants a fortune die to the pool:
//   favorable   — roll twice, keep higher
//   unfavorable — roll twice, keep lower
//   supreme     — roll three times, keep highest

const grantFortune: LexRuleElementDef = {
  type:        'alea.grant-fortune',
  label:       'Grant Fortune',
  description: 'Grants a fortune die (favorable, unfavorable, or supreme) to the next roll.',
  fields: [
    {
      key: 'fortune', label: 'Fortune type', type: 'select', required: true,
      options: [
        { value: 'favorable',   label: 'Favorable (keep higher)'         },
        { value: 'unfavorable', label: 'Unfavorable (keep lower)'        },
        { value: 'supreme',     label: 'Supreme (keep highest of three)' },
      ],
    },
    { key: 'when', label: 'Tag condition (optional)', type: 'tag' },
  ],
  evaluate(_element, _context, _engine): void {
    // Applied via the alea.modifyPool Foundry hook.
  },
  toSentence(element, _vocab): string {
    const fortune = typeof element['fortune'] === 'string' ? element['fortune'] : 'favorable';
    const when    = typeof element['when']    === 'string' ? ` when [${element['when']}]` : '';
    const label   = fortune === 'unfavorable' ? 'Unfavorable'
                  : fortune === 'supreme'     ? 'Supreme'
                  : 'Favorable';
    return `Grant ${label} fortune${when}`;
  },
};

// ─── Plugin definition ────────────────────────────────────────────────────────

const aleaPlugin: LexPlugin = {
  systemId:  'alea-core',
  ruleTypes: [poolModifier, casusModifier, grantFortune],
  tags: [
    { id: 'alea.attack', label: 'Attack'       },
    { id: 'alea.ranged', label: 'Ranged Attack' },
    { id: 'alea.melee',  label: 'Melee Attack'  },
    { id: 'alea.save',   label: 'Saving Throw'  },
    { id: 'alea.skill',  label: 'Skill Check'   },
  ],
};

// ─── Hook handlers ────────────────────────────────────────────────────────────

function onModifyPool(
  poolRef: { pool: DicePool },
  _schema: DiceResolutionSchema,
  ctx: RollContext,
): void {
  const lex = getLexApi();
  if (!lex) return;

  const rules    = lex.getEngine().collectRules(ctx.actor);
  let   modifier = 0;
  let   fortune: Fortune | undefined;

  for (const rule of rules) {
    const when = typeof rule['when'] === 'string' ? rule['when'] : '';

    if (rule.type === 'alea.pool-modifier') {
      if (when && !ctx.tags.has(when)) continue;
      modifier += resolveDynamicValue(rule['by'], ctx);
    } else if (rule.type === 'alea.grant-fortune') {
      if (when && !ctx.tags.has(when)) continue;
      const f = rule['fortune'];
      if (f === 'favorable' || f === 'unfavorable' || f === 'supreme') fortune = f as Fortune;
    }
  }

  if (modifier !== 0 || fortune !== undefined) {
    poolRef.pool = {
      ...poolRef.pool,
      modifier: poolRef.pool.modifier + modifier,
      ...(fortune !== undefined && { fortune }),
    };
  }
}

function onResolveCasus(resolved: ResolvedCasusConfig, ctx: RollContext): void {
  const lex = getLexApi();
  if (!lex) return;

  for (const rule of lex.getEngine().collectRules(ctx.actor)) {
    if (rule.type !== 'alea.casus-modifier') continue;

    const when = typeof rule['when'] === 'string' ? rule['when'] : '';
    if (when && !ctx.tags.has(when)) continue;

    const by       = resolveDynamicValue(rule['by'], ctx);
    const target   = typeof rule['target']   === 'string' ? rule['target']   : '';
    const suppress = typeof rule['suppress'] === 'string' ? rule['suppress'] : '';

    if (target === 'bonusOn')   resolved.bonusOnResolved   += by;
    if (target === 'penaltyOn') resolved.penaltyOnResolved += by;
    if (suppress === 'bonus'   || suppress === 'both') resolved.bonusSuppressed   = true;
    if (suppress === 'penalty' || suppress === 'both') resolved.penaltySuppressed = true;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function initLexIntegration(): void {
  const lex = getLexApi();
  if (!lex) return;

  lex.registerPlugin(aleaPlugin);

  Hooks.on('alea.modifyPool',   onModifyPool   as unknown as (...args: unknown[]) => void);
  Hooks.on('alea.resolveCasus', onResolveCasus as unknown as (...args: unknown[]) => void);
}
