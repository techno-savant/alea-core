import type { RollContext, RollResult, RawDieResult } from '../types/index.js';
import { TierLabelRegistry }      from '../registry/TierLabelRegistry.js';
import { SchemaRegistry }         from '../registry/SchemaRegistry.js';
import { PostRollActionRegistry } from '../registry/PostRollActionRegistry.js';
import { PostRollActionQueue }    from './PostRollActionQueue.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRollResult(v: unknown): v is RollResult {
  return (
    typeof v === 'object' &&
    v !== null &&
    'resolutionId' in v &&
    'tier' in v &&
    'raw' in v &&
    'interpreted' in v
  );
}

function isRollContext(v: unknown): v is RollContext {
  return (
    typeof v === 'object' &&
    v !== null &&
    'actor' in v &&
    'resolutionId' in v &&
    'tags' in v
  );
}

export class RollChatCard {
  static init(): void {
    Hooks.on('alea.tierResolved', (...args: unknown[]): void => {
      const result = args[0];
      const ctx    = args[1];
      if (!isRollResult(result) || !isRollContext(ctx)) return;
      void RollChatCard.create(result, ctx);
    });

    document.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-alea-action]');
      if (btn === null) return;
      const actionId = btn.dataset['aleaAction'];
      if (typeof actionId !== 'string') return;
      PostRollActionQueue.getCurrent()?.select(actionId);
    });
  }

  static async create(result: RollResult, ctx: RollContext): Promise<void> {
    const schema      = SchemaRegistry.get(result.resolutionId);
    const schemaLabel = schema?.label ?? result.resolutionId;

    const tierLabel = TierLabelRegistry.resolveWithFallback(result.tier, {
      ...(result.glitch   !== undefined && { glitch:   result.glitch }),
      ...(result.critical !== undefined && { critical: result.critical }),
    });

    const content = [
      `<div class="alea-roll-card">`,
      `<header class="alea-card-header">`,
      `<span class="alea-schema-label">${esc(schemaLabel)}</span>`,
      `<span class="alea-tier-badge alea-tier-${esc(result.tier)}">${esc(tierLabel)}</span>`,
      `</header>`,
      `<section class="alea-dice">${RollChatCard.#buildDiceHtml(result)}</section>`,
      RollChatCard.#buildSummaryHtml(result),
      RollChatCard.#buildActionsHtml(schema?.postRollActions ?? []),
      `</div>`,
    ].join('');

    const speaker = ChatMessage.getSpeaker({ actor: ctx.actor });
    await ChatMessage.implementation.create({ content, speaker });
  }

  static #buildDiceHtml(result: RollResult): string {
    const raw = result.raw;

    const renderGroup = (g: RawDieResult): string =>
      g.values
        .map((v) => `<span class="alea-die alea-d${g.sides}" data-value="${v}">${v}</span>`)
        .join('');

    if (raw.fortuneSets !== undefined) {
      return `<div class="alea-fortune-sets">${raw.fortuneSets
        .map((set, i) => {
          const keptClass = i === raw.keptSet ? 'alea-fortune-kept' : 'alea-fortune-unkept';
          const dice = set.rolls.map(renderGroup).join('');
          return `<div class="alea-fortune-set ${keptClass}">${dice}</div>`;
        })
        .join('')}</div>`;
    }

    return raw.rolls.map((g) => `<div class="alea-dice-group">${renderGroup(g)}</div>`).join('');
  }

  static #buildSummaryHtml(result: RollResult): string {
    const parts: string[] = [];

    if (result.interpreted.hits > 0) {
      parts.push(
        `<span><span class="alea-summary-label">Hits</span>${result.interpreted.hits}</span>`,
      );
    }
    if (result.interpreted.total > 0 && result.mechanicId !== 'calculi') {
      parts.push(
        `<span><span class="alea-summary-label">Total</span>${result.interpreted.total}</span>`,
      );
    }
    if (result.margin !== undefined) {
      parts.push(
        `<span><span class="alea-summary-label">Margin</span>${result.margin}</span>`,
      );
    }
    if (result.glitch === true) {
      parts.push(`<span class="alea-badge alea-glitch-badge">Glitch</span>`);
    }
    if (result.critical === true) {
      parts.push(`<span class="alea-badge alea-critical-badge">Critical</span>`);
    }
    if (result.quality !== undefined) {
      const cls   = result.quality === 'and' ? 'alea-quality-and-badge' : 'alea-quality-but-badge';
      const label = result.quality === 'and' ? 'And...' : 'But...';
      parts.push(`<span class="alea-badge ${cls}">${label}</span>`);
    }

    if (parts.length === 0) return '';
    return `<section class="alea-summary">${parts.join('')}</section>`;
  }

  static #buildActionsHtml(postRollActionIds: string[]): string {
    const customActions = PostRollActionRegistry.forSchema(postRollActionIds);

    const buttons: string[] = [
      ...customActions.map(
        (a) =>
          `<button class="alea-action-btn" data-alea-action="${esc(a.id)}">${esc(a.label)}</button>`,
      ),
      `<button class="alea-action-btn alea-action-reroll" data-alea-action="${PostRollActionQueue.REROLL.id}">${esc(PostRollActionQueue.REROLL.label)}</button>`,
      `<button class="alea-action-btn alea-action-accept" data-alea-action="${PostRollActionQueue.ACCEPT.id}">${esc(PostRollActionQueue.ACCEPT.label)}</button>`,
    ];

    return `<footer class="alea-actions">${buttons.join('')}</footer>`;
  }
}
