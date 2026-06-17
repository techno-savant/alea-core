/**
 * resolver.ts — Standalone DynamicValue resolver for alea Lex rule elements.
 *
 * Resolves the three DynamicValue forms against a RollContext:
 *   number        → returned directly
 *   { ref }       → dot-path walk against actor/item/target
 *   { formula }   → parsed and evaluated arithmetic expression
 *
 * Supported ref namespaces:
 *   actor.*             — walks the actor object (e.g. actor.system.strength.value)
 *   actor.state.{field} — reads from actor.flags['lex']['state'][field]
 *   item.*              — walks the item object (requires ctx.item)
 *   target.*            — walks first ctx.targets entry (requires at least one target)
 *
 * Formula grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := number | ref-path | '(' expr ')' | fn '(' args ')'
 *   fn     := 'max' | 'min' | 'floor' | 'ceil' | 'abs'
 */

import type { RollContext } from '../types/index.js';

// ─── Path walking ─────────────────────────────────────────────────────────────

function walkPath(obj: unknown, segments: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function toNumber(val: unknown, path: string): number {
  if (val === undefined || val === null) {
    console.warn(`[alea-core] Lex resolver: ref "${path}" is undefined — using 0`);
    return 0;
  }
  const n = Number(val);
  if (Number.isNaN(n)) {
    console.warn(`[alea-core] Lex resolver: ref "${path}" is not numeric — using 0`);
    return 0;
  }
  return n;
}

// ─── Ref path resolution ──────────────────────────────────────────────────────

function resolveRef(path: string, ctx: RollContext): number {
  const segs = path.split('.');

  if (segs[0] === 'actor') {
    // actor.state.{fieldId} — lex state stored in actor flags
    if (segs[1] === 'state') {
      const fieldId = segs.slice(2).join('.');
      return toNumber(ctx.actor.getFlag('lex', `state.${fieldId}`), path);
    }
    // actor.* — walk actor object directly
    return toNumber(walkPath(ctx.actor, segs.slice(1)), path);
  }

  if (segs[0] === 'item') {
    if (ctx.item === undefined) {
      console.warn(`[alea-core] Lex resolver: ref "${path}" requires an item but none is present — using 0`);
      return 0;
    }
    return toNumber(walkPath(ctx.item, segs.slice(1)), path);
  }

  if (segs[0] === 'target') {
    const target = ctx.targets[0];
    if (target === undefined) {
      console.warn(`[alea-core] Lex resolver: ref "${path}" requires a target but none is present — using 0`);
      return 0;
    }
    return toNumber(walkPath(target, segs.slice(1)), path);
  }

  console.warn(`[alea-core] Lex resolver: unknown ref namespace in "${path}" — using 0`);
  return 0;
}

// ─── Formula AST ──────────────────────────────────────────────────────────────

type Expr =
  | { kind: 'Literal'; value: number }
  | { kind: 'Ref';     path: string }
  | { kind: 'BinOp';   op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { kind: 'Call';    fn: 'max' | 'min' | 'floor' | 'ceil' | 'abs'; args: Expr[] };

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { type: 'Number'; value: number }
  | { type: 'Ref';    path: string }
  | { type: 'Fn';     name: 'max' | 'min' | 'floor' | 'ceil' | 'abs' }
  | { type: 'Op';     ch:   '+' | '-' | '*' | '/' }
  | { type: 'LParen' }
  | { type: 'RParen' }
  | { type: 'Comma' }
  | { type: 'EOF' };

const ALLOWED_FNS = new Set<string>(['max', 'min', 'floor', 'ceil', 'abs']);

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9') || ch === '.' || ch === '-';
}

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === undefined) break;

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i++; continue; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'Op', ch: ch as '+' | '-' | '*' | '/' }); i++; continue;
    }
    if (ch === '(') { tokens.push({ type: 'LParen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RParen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'Comma'  }); i++; continue; }

    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < src.length) {
        const c = src[i];
        if (c === undefined || !((c >= '0' && c <= '9') || c === '.')) break;
        num += c; i++;
      }
      tokens.push({ type: 'Number', value: parseFloat(num) });
      continue;
    }

    if (isIdentStart(ch)) {
      let id = '';
      while (i < src.length) {
        const c = src[i];
        if (c === undefined || !isIdentChar(c)) break;
        id += c; i++;
      }
      if (src.slice(i).trimStart().startsWith('(')) {
        if (!ALLOWED_FNS.has(id)) throw new Error(`Unknown function '${id}' in formula`);
        tokens.push({ type: 'Fn', name: id as 'max' | 'min' | 'floor' | 'ceil' | 'abs' });
      } else {
        tokens.push({ type: 'Ref', path: id });
      }
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i} in formula`);
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF' };
  }
  private consume(): Token {
    return this.tokens[this.pos++] ?? { type: 'EOF' };
  }
  private expect(type: Token['type']): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type}`);
    return t;
  }

  parseExpr(): Expr {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t.type === 'Op' && (t.ch === '+' || t.ch === '-')) {
        this.consume();
        left = { kind: 'BinOp', op: t.ch, left, right: this.parseTerm() };
      } else break;
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t.type === 'Op' && (t.ch === '*' || t.ch === '/')) {
        this.consume();
        left = { kind: 'BinOp', op: t.ch, left, right: this.parseFactor() };
      } else break;
    }
    return left;
  }

  private parseFactor(): Expr {
    const t = this.peek();

    if (t.type === 'Op' && t.ch === '-') {
      this.consume();
      return { kind: 'BinOp', op: '-', left: { kind: 'Literal', value: 0 }, right: this.parseFactor() };
    }
    if (t.type === 'Number') { this.consume(); return { kind: 'Literal', value: t.value }; }
    if (t.type === 'Ref')    { this.consume(); return { kind: 'Ref', path: t.path }; }
    if (t.type === 'LParen') {
      this.consume();
      const inner = this.parseExpr();
      this.expect('RParen');
      return inner;
    }
    if (t.type === 'Fn') {
      this.consume();
      this.expect('LParen');
      const args: Expr[] = [this.parseExpr()];
      while (this.peek().type === 'Comma') { this.consume(); args.push(this.parseExpr()); }
      this.expect('RParen');
      return { kind: 'Call', fn: t.name, args };
    }

    throw new Error(`Unexpected token '${t.type}' while parsing formula`);
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

function evalExpr(ast: Expr, ctx: RollContext): number {
  switch (ast.kind) {
    case 'Literal': return ast.value;
    case 'Ref':     return resolveRef(ast.path, ctx);
    case 'BinOp': {
      const l = evalExpr(ast.left, ctx);
      const r = evalExpr(ast.right, ctx);
      if (ast.op === '+') return l + r;
      if (ast.op === '-') return l - r;
      if (ast.op === '*') return l * r;
      if (r === 0) { console.warn('[alea-core] Lex resolver: division by zero in formula — using 0'); return 0; }
      return l / r;
    }
    case 'Call': {
      const vals = ast.args.map(a => evalExpr(a, ctx));
      if (ast.fn === 'max')   return Math.max(...vals);
      if (ast.fn === 'min')   return Math.min(...vals);
      if (ast.fn === 'floor') return Math.floor(vals[0] ?? 0);
      if (ast.fn === 'ceil')  return Math.ceil(vals[0] ?? 0);
      return Math.abs(vals[0] ?? 0); // abs
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a DynamicValue (number | { ref } | { formula }) to a concrete number
 * against the given RollContext.
 *
 * Returns 0 and logs a console warning for any unresolvable value.
 */
export function resolveDynamicValue(val: unknown, ctx: RollContext): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'object' || val === null) return 0;

  if ('ref' in val && typeof (val as Record<string, unknown>)['ref'] === 'string') {
    return resolveRef((val as { ref: string }).ref, ctx);
  }

  if ('formula' in val && typeof (val as Record<string, unknown>)['formula'] === 'string') {
    try {
      const ast = new Parser(tokenise((val as { formula: string }).formula)).parseExpr();
      return evalExpr(ast, ctx);
    } catch (err) {
      console.warn(`[alea-core] Lex resolver: formula error — ${String(err)}`);
      return 0;
    }
  }

  return 0;
}
