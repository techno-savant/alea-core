# alea-core Unit Test Analysis

## Scope

### Included
| Module | File |
|--------|------|
| Calculi mechanic | `src/mechanics/Calculi.ts` |
| Limen mechanic | `src/mechanics/Limen.ts` |
| Gradus mechanic | `src/mechanics/Gradus.ts` |
| Scala mechanic | `src/mechanics/Scala.ts` |
| Bivium mechanic | `src/mechanics/Bivium.ts` |
| Fulmen mechanic | `src/mechanics/Fulmen.ts` |
| Comes mechanic | `src/mechanics/Comes.ts` |
| Certamen mechanic | `src/mechanics/Certamen.ts` |
| Casus mechanic | `src/mechanics/Casus.ts` |
| MechanicRegistry | `src/registry/MechanicRegistry.ts` |
| SchemaRegistry | `src/registry/SchemaRegistry.ts` |
| ModifierRegistry | `src/registry/ModifierRegistry.ts` |
| TierLabelRegistry | `src/registry/TierLabelRegistry.ts` |
| PostRollActionRegistry | `src/registry/PostRollActionRegistry.ts` |
| assemble pipeline stage | `src/pipeline/assemble.ts` |
| modify pipeline stage | `src/pipeline/modify.ts` |
| roll pipeline stage | `src/pipeline/roll.ts` |
| interpret pipeline stage | `src/pipeline/interpret.ts` |
| tier pipeline stage | `src/pipeline/tier.ts` |
| PostRollActionQueue | `src/chat/PostRollActionQueue.ts` |
| AutomationSequencer | `src/automation/Sequencer.ts` |

### Excluded
| Module | Reason |
|--------|--------|
| `src/types/index.ts` | Type declarations only — nothing to test |
| `src/declarations.d.ts` | Ambient globals — nothing to test |
| `src/index.ts` | `Hooks.once('init')` / `Hooks.once('ready')` lifecycle — integration test material |
| `src/api.ts` | Full-registry integration layer — integration test material |
| `src/pipeline/RollPipeline.ts` | Orchestrates all stages + live `game.settings.get` — integration test material |
| `src/mechanics/index.ts` | Re-export barrel only — 0% statements by design |

---

## Infrastructure Required

No `tests/` directory exists. No vitest in `package.json`. Generate workflow must create:

**Install** (run before generating):
```bash
npm install --save-dev vitest @vitest/coverage-v8
```

**`vitest.config.ts`** (project root):
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup/foundry.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/declarations.d.ts',
        'src/index.ts',
        'src/api.ts',
        'src/pipeline/RollPipeline.ts',
        'src/mechanics/index.ts',
      ],
    },
  },
});
```

**`tests/setup/foundry.ts`**:
```ts
import { vi, beforeEach, afterEach } from 'vitest';
beforeEach(() => {
  (globalThis as Record<string, unknown>).Hooks = {
    once:    vi.fn(),
    on:      vi.fn(),
    off:     vi.fn(),
    callAll: vi.fn(),
  };
  (globalThis as Record<string, unknown>).game = {
    settings: { get: vi.fn(), register: vi.fn() },
  };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).Hooks;
  delete (globalThis as Record<string, unknown>).game;
});
```

**`package.json` additions**:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

---

## Shared Test Helpers

Place in `tests/helpers/fixtures.ts`. Used by 3+ test files.

```ts
import type { FoundryActor, RollContext, RawRollResult } from '../../src/types/index.js';

export function makeActor(overrides: Partial<FoundryActor> = {}): FoundryActor {
  return {
    id: 'actor-1', name: 'Test Actor', system: {},
    getFlag: () => undefined,
    setFlag: async () => ({ id: 'actor-1', name: 'Test Actor', system: {}, getFlag: () => undefined, setFlag: async () => ({} as FoundryActor) }),
    ...overrides,
  } as FoundryActor;
}

export function makeCtx(overrides: Partial<RollContext> = {}): RollContext {
  return {
    actor: makeActor(),
    targets: [],
    tags: new Set<string>(),
    resolutionId: 'test-schema',
    automationLevel: 'full',
    ...overrides,
  };
}

export function makeRaw(rolls: { sides: number; values: number[] }[], modifier = 0): RawRollResult {
  return { rolls, modifier };
}
```

**Registry singleton isolation note**: Registry modules export singletons. Tests within a file share the same instance. Each test MUST use unique string IDs (e.g. `'test-mechanic-' + Math.random().toString(36)`) to avoid cross-test interference. Do not use `beforeEach` to clear registries — there is no public `clear()` method.

**MechanicRegistry mock pattern** (for Fulmen, Comes, Casus, assemble, interpret, tier, roll):
```ts
vi.mock('../../registry/MechanicRegistry.js', () => ({
  MechanicRegistry: { get: vi.fn(), register: vi.fn(), has: vi.fn(), all: vi.fn() },
}));
// In test: (MechanicRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(innerMechanic);
```

---

## 1. `src/mechanics/Calculi.ts`

### `assemble`

**Boundary Tests**
- `should build pool with provided sides and count`
- `should always set pool modifier to 0`

**Scenario Tests**
- `should return a single dice face entry`
- `should narrow the config and use calculi-typed fields`

**Failure Tests**
- `should throw when config type is not calculi`

---

### `roll`

**Boundary Tests**
- `should produce exactly count values per die face`
- `should clamp all values to [1, sides] inclusive`

**Scenario Tests**
- `should return rolls array with modifier 0`
- `should handle multiple die faces independently`

---

### `interpret`

**Boundary Tests**
- `should count 0 hits when all dice are below threshold`
- `should count all dice as hits when all meet threshold`

**Scenario Tests**
- `should count only dice at or above threshold`
- `should count glitches when glitchOn is set`
- `should omit glitches field when glitchOn is undefined`

**Combinatorial Tests**
- `should count glitches independently from hits (dice can be both hit and glitch)`

---

### `tier`

**Boundary Tests**
- `should return miss when hits is 0 and no glitch`
- `should return hit when hits is 1 and no glitch`

**Scenario Tests**
- `should return strong-hit when hits meets strongHitAt threshold`
- `should return hit+glitch when hits>0 and glitch ratio meets threshold`
- `should return miss+glitch when hits=0 and glitch ratio meets threshold`
- `should not glitch when glitchOn is undefined`
- `should use default glitchThreshold of 0.5 when not specified`

---

## 2. `src/mechanics/Limen.ts`

### `assemble`

**Boundary Tests**
- `should default count to 1 when not provided in config`
- `should use provided count when specified`

**Scenario Tests**
- `should return pool with correct sides`

**Failure Tests**
- `should throw when config type is not limen`

---

### `roll`

**Boundary Tests**
- `should fall back to config.sides when pool.dice is empty`

**Scenario Tests**
- `should sum all values when sumMode is sum or unset`
- `should pick the highest value when sumMode is highest`
- `should incorporate pool.modifier into modifier field`

---

### `interpret`

**Scenario Tests**
- `should return hits=1 when total >= target`
- `should return hits=0 when total < target`
- `should use raw.modifier as total`

---

### `tier`

**Scenario Tests**
- `should return hit when hits >= 1`
- `should return miss when hits is 0`

---

## 3. `src/mechanics/Gradus.ts`

### `assemble`

**Scenario Tests**
- `should use provided sides and count`
- `should default count to 1`

**Failure Tests**
- `should throw when config type is not gradus`

---

### `roll`

**Scenario Tests**
- `should sum all values with modifier when sumMode is sum`
- `should pick highest value with modifier when sumMode is highest`

---

### `interpret`

**Scenario Tests**
- `should set hits to 1 when total >= target`
- `should set hits to 0 when total < target`
- `should include correct total`

---

### `tier`

**Boundary Tests**
- `should return strong-hit when margin >= critMargin`
- `should return hit when margin >= 0`
- `should return miss when margin < 0 and fumbleMargin undefined`

**Scenario Tests**
- `should return close-hit when margin > -fumbleMargin and fumbleMargin is set`
- `should include margin in all tier results`

**Combinatorial Tests**
- `should correctly classify all four tiers across a margin range`

---

## 4. `src/mechanics/Scala.ts`

### `assemble`

**Scenario Tests**
- `should read attribute value from scala:attributeValue: tag`
- `should map attribute value to die size via stepsMap`
- `should apply overflow modifier when attrValue exceeds max key`
- `should use default sides (4) when attrValue not in map and no fallback`
- `should default to attribute value 1 when no tag present`

**Boundary Tests**
- `should handle attrValue exactly at maxKey without overflow`

---

### `roll`

**Boundary Tests**
- `should return empty rolls when pool has no dice`

**Scenario Tests**
- `should produce one value in [1, sides]`
- `should carry pool.modifier through`

---

### `interpret`

**Scenario Tests**
- `should sum rolled value and modifier as total`
- `should always return hits=1`
- `should handle empty rolls with modifier only`

---

### `tier`

**Scenario Tests**
- `should always return hit`

---

## 5. `src/mechanics/Bivium.ts`

### `assemble`

**Scenario Tests**
- `should produce exactly 2 dice (positive and negative)`
- `should label each die correctly`
- `should apply optional modifier`
- `should default modifier to 0 when absent`

**Failure Tests**
- `should throw when config type is not bivium`

---

### `roll`

**Scenario Tests**
- `should roll exactly 1 value per die`
- `should produce 2 roll entries`

---

### `interpret`

**Boundary Tests**
- `should throw when pool has fewer than 2 dice results`

**Scenario Tests**
- `should sum positive and negative dice rolls separately`
- `should combine into total with modifier`
- `should return hits=1 when total >= target`
- `should return hits=0 when total < target`

---

### `tier` — threshold mode

**Boundary Tests**
- `should return hit+and when positiveTotal > negativeTotal and isHit`
- `should return hit+but when negativeTotal > positiveTotal and isHit`
- `should return miss+and when positiveTotal > negativeTotal and not isHit`
- `should return miss+but when negativeTotal > positiveTotal and not isHit`

**Scenario Tests**
- `should return hit+and+critical when tied and criticalOn=tie and isHit`
- `should return miss+and+critical when tied and criticalOn=tie and not isHit`
- `should return hit+but when tied and criticalOn=never`

### `tier` — bandMode

**Scenario Tests**
- `should match band when total is within band range`
- `should return miss when no band matches`
- `should mark critical on tie when criticalOn=tie in bandMode`
- `should include quality from band when quality is not null`
- `should omit quality when band.quality is null`

---

## 6. `src/mechanics/Fulmen.ts`

### `assemble`

**Scenario Tests**
- `should delegate assemble to inner mechanic`

**Failure Tests**
- `should throw when inner mechanic is not registered`
- `should throw when config type is not fulmen`

---

### `roll`

**Scenario Tests**
- `should not explode when no die equals trigger`
- `should add exploded dice when die equals explodeOn`
- `should use sides as trigger when explodeOn is undefined`
- `should stop explosion chain at maxChain`
- `should include exploded values in values array`

**Boundary Tests**
- `should cap explosion chain at maxChain=10 by default`

---

### `interpret` / `tier`

**Scenario Tests**
- `should delegate interpret to inner mechanic`
- `should delegate tier to inner mechanic`

---

## 7. `src/mechanics/Comes.ts`

### `assemble`

**Scenario Tests**
- `should append companion die after inner pool dice`
- `should use comesSides for companion die`
- `should use comesLabel when provided`
- `should default companion label to "Wild Die"`

**Failure Tests**
- `should throw when inner mechanic is not registered`
- `should throw when config type is not comes`

---

### `roll`

**Scenario Tests**
- `should roll all dice including companion`

---

### `interpret`

**Boundary Tests**
- `should throw when companion die is missing from raw rolls`

**Scenario Tests**
- `should keep companion result when companion has more hits`
- `should keep primary result when primary has more hits`
- `should use raw from original roll in returned result`

---

### `tier`

**Scenario Tests**
- `should delegate tier to inner mechanic`

---

## 8. `src/mechanics/Certamen.ts`

### `assemble`

**Scenario Tests**
- `should return empty pool with 0 modifier`

---

### `roll`

**Scenario Tests**
- `should return empty rolls with 0 modifier`

---

### `interpret`

**Boundary Tests**
- `should return 0 netHits when attacker schema missing from sequence`
- `should return 0 netHits when defender schema missing from sequence`
- `should return 0 netHits when sequence is absent`

**Scenario Tests**
- `should compute netHits as max(0, attackerHits - defenderHits)`
- `should clamp netHits to 0 when defender wins`

**Failure Tests**
- `should throw when config type is not certamen`

---

### `tier`

**Boundary Tests**
- `should return miss when netHits is below glancing threshold`

**Scenario Tests**
- `should return glancing when netHits meets glancing threshold`
- `should return hit when netHits meets hit threshold`
- `should return strong-hit when netHits meets strongHit threshold`

---

## 9. `src/mechanics/Casus.ts`

### `isResolved` (module-level guard)

**Scenario Tests**
- `should return true when bonusOnResolved and penaltyOnResolved are present`
- `should return false when resolved fields are absent`

---

### `assemble`

**Scenario Tests**
- `should append casus die with same sides as primary`
- `should default casus die sides to 6 when inner pool is empty`
- `should use casusLabel when provided`
- `should default casus label to "Casus Die"`

**Failure Tests**
- `should throw when config type is not casus`
- `should throw when inner mechanic is not registered`

---

### `interpret`

**Boundary Tests**
- `should throw when casus die is missing from raw rolls`

**Scenario Tests**
- `should add bonus hit when casusValue >= bonusOn`
- `should remove hit when casusValue <= penaltyOn`
- `should clamp hits to 0 when penalty would go negative`
- `should not apply bonus when bonusSuppressed in resolved config`
- `should not apply penalty when penaltySuppressed in resolved config`
- `should use resolved thresholds when config is resolved`

**Combinatorial Tests**
- `should apply both bonus and penalty independently when both thresholds met`

---

### `tier`

**Scenario Tests**
- `should delegate tier to inner mechanic`

---

## 10. `src/registry/MechanicRegistry.ts`

**Note**: Registry is a singleton. Each test uses a unique id prefix to avoid cross-test interference.

### `register`

**Scenario Tests**
- `should store a mechanic and make it retrievable by id`
- `should warn via console.warn when replacing an existing mechanic`

### `get`

**Boundary Tests**
- `should return undefined for an unregistered id`

**Scenario Tests**
- `should return the registered mechanic`

### `has`

**Scenario Tests**
- `should return true for a registered id`
- `should return false for an unregistered id`

### `all`

**Scenario Tests**
- `should include all registered mechanics`

---

## 11. `src/registry/SchemaRegistry.ts`

### `register`

**Scenario Tests**
- `should store a schema and make it retrievable by id`
- `should warn via console.warn when replacing an existing schema`

### `get`

**Boundary Tests**
- `should return undefined for an unregistered id`

### `has`

**Scenario Tests**
- `should return true for a registered id`
- `should return false for an unregistered id`

---

## 12. `src/registry/ModifierRegistry.ts`

### `register`

**Scenario Tests**
- `should store a modifier and make it retrievable by id`
- `should warn via console.warn when replacing an existing modifier`

### `bySchema`

**Boundary Tests**
- `should return empty array when no modifiers match schemaId`

**Scenario Tests**
- `should return all modifiers with matching schemaId`
- `should not return modifiers for a different schemaId`

---

## 13. `src/registry/TierLabelRegistry.ts`

### `register`

**Scenario Tests**
- `should store and retrieve a bare tier label`
- `should merge new labels — later registration wins on collision`

### `resolve`

**Boundary Tests**
- `should return undefined for unregistered key`

**Scenario Tests**
- `should return registered label for a tier key`
- `should return registered label for a composite key`

### `resolveWithFallback`

**Scenario Tests**
- `should return composite glitch label when glitch flag is true and composite is registered`
- `should return composite critical label when critical flag is true and composite is registered`
- `should fall back to bare tier label when composite not registered`
- `should fall back to tier string when no label is registered at all`
- `should prefer glitch composite over critical composite when both flags are true`

---

## 14. `src/registry/PostRollActionRegistry.ts`

### `register`

**Scenario Tests**
- `should store an action and make it retrievable by id`
- `should warn via console.warn when replacing an existing action`

### `get` / `has`

**Scenario Tests**
- `should return the action for a known id`
- `should return undefined for an unknown id`
- `should return true for a registered id`
- `should return false for an unregistered id`

### `forSchema`

**Boundary Tests**
- `should return empty array for an empty id list`
- `should silently skip unknown action ids`

**Scenario Tests**
- `should return actions in the order of the provided id list`
- `should return only actions whose ids are in the provided list`

---

## 15. `src/pipeline/assemble.ts`

**Mocking**: `vi.mock('../../registry/MechanicRegistry.js', ...)`

### `assemblePool`

**Boundary Tests**
- `should throw when mechanic is not registered`

**Scenario Tests**
- `should delegate to mechanic.assemble and return pool`
- `should apply poolBuilder to override die count on first die`
- `should preserve remaining dice when poolBuilder overrides count`

**Failure Tests**
- `should throw when poolBuilder returns 0`
- `should throw when poolBuilder returns a negative number`
- `should throw when mechanic returns empty dice array and poolBuilder is set`

---

## 16. `src/pipeline/modify.ts`

**Mocking**: `vi.mock('../../registry/ModifierRegistry.js', ...)` + `Hooks.callAll` from setup/foundry.ts

### `modifyPool`

**Scenario Tests**
- `should accumulate static modifiers onto pool modifier`
- `should record each modifier in returned modifiers array with correct sourceType=schema`
- `should fire alea.modifyPool hook with poolRef wrapper`
- `should apply pool replacement from hook listener`
- `should return no resolvedCasus for non-casus schema`
- `should return resolvedCasus for casus schema with bonusOn/penaltyOn copied`
- `should fire alea.resolveCasus hook for casus schema`

---

## 17. `src/pipeline/roll.ts`

**Mocking**: `vi.mock('../../registry/MechanicRegistry.js', ...)` + `Hooks.callAll` from setup/foundry.ts

### `rollPool`

**Boundary Tests**
- `should throw when mechanic is not registered`

**Scenario Tests**
- `should call mechanic.roll when no fortune modifier`
- `should fire alea.rollAnimated hook after rolling`

**Fortune Tests**
- `should roll 2 sets for favorable fortune and keep highest hits`
- `should roll 2 sets for unfavorable fortune and keep lowest hits`
- `should roll 3 sets for supreme fortune`
- `should set fortuneSets and keptSet on returned result`
- `should use first index on hit-count tie for favorable`
- `should use first index on hit-count tie for unfavorable`

---

## 18. `src/pipeline/interpret.ts` and `src/pipeline/tier.ts`

Single test file for both (both are simple delegation wrappers).

**Mocking**: `vi.mock('../../registry/MechanicRegistry.js', ...)`

### `interpretRoll`

**Boundary Tests**
- `should throw when mechanic is not registered`

**Scenario Tests**
- `should delegate to mechanic.interpret and return result`

### `tierRoll`

**Boundary Tests**
- `should throw when mechanic is not registered`

**Scenario Tests**
- `should delegate to mechanic.tier and return result`

---

## 19. `src/chat/PostRollActionQueue.ts`

**Uses**: `vi.useFakeTimers()` for timeout tests, `Hooks.callAll` from setup/foundry.ts

### Constructor / `open`

**Boundary Tests**
- `should filter schema actions to those available on result tier`
- `should include actions with empty availableOn for any tier`
- `should resolve immediately on select when no timeout`

**Scenario Tests**
- `should auto-select alea.accept after timeout when timeoutMs is not null`
- `should not auto-resolve when timeoutMs is null`
- `should expose ACCEPT static constant`
- `should expose REROLL static constant`

### `select`

**Scenario Tests**
- `should resolve the promise with the matching action`
- `should always include REROLL in selectable actions`
- `should always include ACCEPT in selectable actions`
- `should deduplicate consumer-registered alea.reroll and alea.accept ids`
- `should fire alea.actionTaken hook before resolving`

**Failure Tests**
- `should reject the promise for an unknown action id`
- `should no-op when called after already resolved`

### `cancel`

**Scenario Tests**
- `should reject the promise with "Queue cancelled"`
- `should clear the timer on cancel`
- `should no-op when called after already resolved`

---

## 20. `src/automation/Sequencer.ts`

**No mocking needed** — `rollFn` is injected. `Hooks` global not used.

### `shouldPrompt`

**Scenario Tests**
- `should return true when level is semi`
- `should return false when level is full`
- `should return false when level is none`

### `sequence`

**Boundary Tests**
- `should return without calling rollFn when automationConfig is absent`
- `should return without calling rollFn when followUps is empty`

**Scenario Tests**
- `should call rollFn once per matching followUp`
- `should skip followUp when tier does not match followUp.on`
- `should fire all followUps when followUp.on is empty`
- `should log and skip when automationLevel is none`
- `should use ctx.actor as target when targetMode is self`
- `should use ctx.targets[0] as target when targetMode is first-target and targets exist`
- `should fall back to ctx.actor when targets is empty and targetMode is first-target`

**Sequence Context Tests**
- `should create a new sequence with a generated id when ctx.sequence is absent`
- `should append to existing sequence when ctx.sequence is present`
- `should include item in SequenceRoll when ctx.item is set`
- `should not include item in SequenceRoll when ctx.item is absent`

---

## Test File Plan

| File | Source |
|------|--------|
| `tests/unit/mechanics/calculi.test.ts` | `src/mechanics/Calculi.ts` |
| `tests/unit/mechanics/limen.test.ts` | `src/mechanics/Limen.ts` |
| `tests/unit/mechanics/gradus.test.ts` | `src/mechanics/Gradus.ts` |
| `tests/unit/mechanics/scala.test.ts` | `src/mechanics/Scala.ts` |
| `tests/unit/mechanics/bivium.test.ts` | `src/mechanics/Bivium.ts` |
| `tests/unit/mechanics/fulmen.test.ts` | `src/mechanics/Fulmen.ts` |
| `tests/unit/mechanics/comes.test.ts` | `src/mechanics/Comes.ts` |
| `tests/unit/mechanics/certamen.test.ts` | `src/mechanics/Certamen.ts` |
| `tests/unit/mechanics/casus.test.ts` | `src/mechanics/Casus.ts` |
| `tests/unit/registry/mechanic-registry.test.ts` | `src/registry/MechanicRegistry.ts` |
| `tests/unit/registry/schema-registry.test.ts` | `src/registry/SchemaRegistry.ts` |
| `tests/unit/registry/modifier-registry.test.ts` | `src/registry/ModifierRegistry.ts` |
| `tests/unit/registry/tier-label-registry.test.ts` | `src/registry/TierLabelRegistry.ts` |
| `tests/unit/registry/post-roll-action-registry.test.ts` | `src/registry/PostRollActionRegistry.ts` |
| `tests/unit/pipeline/assemble.test.ts` | `src/pipeline/assemble.ts` |
| `tests/unit/pipeline/modify.test.ts` | `src/pipeline/modify.ts` |
| `tests/unit/pipeline/roll.test.ts` | `src/pipeline/roll.ts` |
| `tests/unit/pipeline/interpret-and-tier.test.ts` | `src/pipeline/interpret.ts` + `src/pipeline/tier.ts` |
| `tests/unit/chat/post-roll-action-queue.test.ts` | `src/chat/PostRollActionQueue.ts` |
| `tests/unit/automation/sequencer.test.ts` | `src/automation/Sequencer.ts` |

**Estimated test count**: ~210 named tests across 20 files.
