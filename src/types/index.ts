// ─── Primitive unions ────────────────────────────────────────────────────────

export type AutomationLevel = 'full' | 'semi' | 'none';
export type Quality         = 'and' | 'but';
export type Fortune         = 'favorable' | 'unfavorable' | 'supreme';
export type ResultTier      = 'strong-hit' | 'hit' | 'close-hit' | 'glancing' | 'miss';

/** Composite key for tier labels — glitch is a flag that overlays any tier. */
export type TierLabelKey =
  | ResultTier
  | `${ResultTier}+glitch`
  | `${ResultTier}+critical`;

// ─── Foundry document stubs ───────────────────────────────────────────────────
// Minimal shapes used in public API. Replace with foundry-vtt-types when available.

export interface FoundryDocument {
  readonly id:   string;
  readonly name: string;
}

export interface FoundryActor extends FoundryDocument {
  readonly system: Record<string, unknown>;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<FoundryActor>;
}

// ─── Mechanic configs (discriminated union) ───────────────────────────────────

export interface CalculiConfig {
  readonly type: 'calculi';
  sides:              number;
  count:              number;
  threshold:          number;
  glitchOn?:         number;
  glitchThreshold?:  number;
  strongHitAt?:      number;
}

export interface LimenConfig {
  readonly type: 'limen';
  sides:    number;
  count?:   number;
  target:   number;
  sumMode?: 'sum' | 'highest';
}

export interface GradusConfig extends Omit<LimenConfig, 'type'> {
  readonly type: 'gradus';
  critMargin:    number;
  fumbleMargin?: number;
}

export interface FulmenConfig {
  readonly type: 'fulmen';
  wraps:      MechanicConfig;
  explodeOn?: number;
  maxChain?:  number;
}

export interface ComesConfig {
  readonly type: 'comes';
  wraps:       MechanicConfig;
  comesSides:  number;
  comesLabel?: string;
}

export interface ScalaConfig {
  readonly type: 'scala';
  stepsMap:          Record<number, number>;
  overflowModifier?: number;
}

export interface CertamenConfig {
  readonly type: 'certamen';
  attackerSchema: string;
  defenderSchema: string;
  netHitTiers: {
    strongHit: number;
    hit:       number;
    glancing:  number;
  };
}

export interface BiviumBand {
  min:      number;
  max?:     number;
  tier:     ResultTier;
  quality:  Quality | null;
}

export interface BiviumConfig {
  readonly type:  'bivium';
  positiveSides:  number;
  negativeSides:  number;
  target:         number;
  modifier?:      number;
  criticalOn:     'tie' | 'never';
  bandMode?:      { bands: BiviumBand[] };
}

export interface CasusConfig {
  readonly type: 'casus';
  wraps:       MechanicConfig;
  bonusOn:     number;
  penaltyOn:   number;
  casusLabel?: string;
}

/** Casus config after Lex laws and the alea.resolveCasus hook have been applied. */
export interface ResolvedCasusConfig extends CasusConfig {
  bonusOnResolved:   number;
  penaltyOnResolved: number;
  penaltySuppressed: boolean;
  bonusSuppressed:   boolean;
}

export type MechanicConfig =
  | CalculiConfig
  | LimenConfig
  | GradusConfig
  | FulmenConfig
  | ComesConfig
  | ScalaConfig
  | CertamenConfig
  | BiviumConfig
  | CasusConfig;

// ─── Pool / Roll / Interpret / Tier ──────────────────────────────────────────

export interface DieFace {
  sides: number;
  count: number;
  label?: string;
}

export interface DicePool {
  dice:      DieFace[];
  modifier:  number;
  fortune?:  Fortune;
}

export interface RawDieResult {
  sides:     number;
  values:    number[];
  exploded?: number[];
}

export interface RawRollResult {
  rolls:         RawDieResult[];
  modifier:      number;
  fortuneSets?:  RawRollResult[];
  keptSet?:      number;
}

export interface InterpretedResult {
  hits:           number;
  total:          number;
  glitches?:      number;
  positiveTotal?: number;
  negativeTotal?: number;
  raw:            RawRollResult;
}

export interface TierResult {
  tier:      ResultTier;
  quality?:  Quality;
  critical?: boolean;
  glitch?:   boolean;
  margin?:   number;
}

// ─── DiceMechanic strategy interface ─────────────────────────────────────────

export interface DiceMechanic {
  readonly id:    string;
  readonly label: string;
  assemble(config: MechanicConfig, ctx: RollContext): DicePool;
  roll(pool: DicePool, config: MechanicConfig): RawRollResult;
  interpret(raw: RawRollResult, config: MechanicConfig, ctx: RollContext): InterpretedResult;
  tier(interpreted: InterpretedResult, config: MechanicConfig, ctx: RollContext): TierResult;
}

// ─── Modifiers ───────────────────────────────────────────────────────────────

export interface ModifierEntry {
  value:       number;
  sourceLabel: string;
  sourceType:  'law' | 'effect' | 'schema' | 'manual';
}

// ─── Sequence (Gap 2 — chained roll context) ─────────────────────────────────

export interface SequenceRoll {
  schemaId: string;
  result:   RollResult;
  item?:    FoundryDocument;
}

export interface SequenceContext {
  id:    string;
  rolls: SequenceRoll[];
  item?: FoundryDocument;
}

// ─── Roll context / result ────────────────────────────────────────────────────

/** Minimal Lex API surface Alea depends on. Avoids a hard import from lexicon-core. */
export interface LexApiSlice {
  readonly version: string;
}

export interface RollContext {
  actor:            FoundryActor;
  item?:            FoundryDocument;
  targets:          FoundryActor[];
  tags:             ReadonlySet<string>;
  resolutionId:     string;
  automationLevel:  AutomationLevel;
  sequence?:        SequenceContext;
  lex?:             LexApiSlice;
}

export interface RollResult {
  resolutionId: string;
  mechanicId:   string;
  tier:         ResultTier;
  quality?:     Quality;
  critical?:    boolean;
  glitch?:      boolean;
  margin?:      number;
  hits:         number;
  raw:          RawRollResult;
  modifiers:    ModifierEntry[];
  interpreted:  InterpretedResult;
  tiered:       TierResult;
  timestamp:    number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface AutomationFollowUp {
  schemaId:    string;
  on:          ResultTier[];
  targetMode:  'selected' | 'self' | 'first-target';
}

export interface DiceResolutionSchema {
  id:              string;
  label:           string;
  mechanic:        string;
  mechanicConfig:  MechanicConfig;
  automationConfig?: { followUps: AutomationFollowUp[] };
  postRollActions?: string[];
  queueTimeout?:   number;
  /** Gap 1 — overrides pool die count at ASSEMBLE time; mechanic still owns die size. */
  poolBuilder?:    (ctx: RollContext) => number;
  /** Gap 5 — runs after AUTOMATE stage; use for side effects (e.g. recoil counter). */
  onComplete?:     (result: RollResult, ctx: RollContext) => Promise<void>;
}

// ─── Post-roll ────────────────────────────────────────────────────────────────

/** Gap 3 — selective reroll: filter failed dice OR add extra dice, or both. */
export interface PartialRerollOptions {
  filter?:  (die: { sides: number; value: number }) => boolean;
  addDice?: number;
}

export interface PostRollAction {
  id:          string;
  label:       string;
  icon?:       string;
  availableOn: ResultTier[];
  handler(result: RollResult, ctx: RollContext, api: AleaApi): Promise<void>;
}

// ─── Misc registration types ──────────────────────────────────────────────────

export interface StaticModifierDeclaration {
  id:          string;
  schemaId:    string;
  value:       number;
  sourceLabel: string;
}

export interface AutomationRule {
  id:                string;
  schemaId:          string;
  followUpSchemaId:  string;
  on:                ResultTier[];
  targetMode:        'selected' | 'self' | 'first-target';
}

export interface RollRequest {
  actor:         FoundryActor;
  item?:         FoundryDocument;
  targets?:      FoundryActor[];
  resolutionId:  string;
  overrides?:    Partial<DicePool>;
  sequence?:     SequenceContext;
}

// ─── Public module API ────────────────────────────────────────────────────────

export interface AleaRitus {
  readonly id:    string;
  readonly label: string;
  registerWith(alea: AleaApi): void;
}

export interface AleaApi {
  registerRitus(ritus: AleaRitus): void;
  registerMechanic(mechanic: DiceMechanic): void;
  registerSchema(schema: DiceResolutionSchema): void;
  registerModifier(modifier: StaticModifierDeclaration): void;
  registerPostRollAction(action: PostRollAction): void;
  registerAutomationRule(rule: AutomationRule): void;
  /** Gap 4 — TierLabelKey supports composite keys like 'hit+glitch'. */
  registerTierLabels(labels: Partial<Record<TierLabelKey, string>>): void;
  roll(request: RollRequest): Promise<RollResult>;
  /** Gap 3 — partial reroll: filter subset of dice or augment with extra dice. */
  partialReroll(result: RollResult, ctx: RollContext, options: PartialRerollOptions): Promise<RollResult>;
  getMechanic(id: string): DiceMechanic | undefined;
  getSchema(id: string): DiceResolutionSchema | undefined;
}
