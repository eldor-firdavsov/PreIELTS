/**
 * Static extraction of object/array literals from an inline <script>.
 *
 * The source files declare their answer keys as plain literals. We parse them
 * with acorn and walk the AST by hand. Nothing is executed: a construct we
 * cannot evaluate statically raises, it never falls back to eval or Function.
 */
import { parse } from 'acorn';

export type StaticValue = string | number | boolean | null | StaticValue[] | { [k: string]: StaticValue };

class NotStatic extends Error {}

/** Depth-first walk over every node in an acorn AST. */
function* walk(node: any): Generator<any> {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
    return;
  }
  if (typeof node.type === 'string') yield node;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    yield* walk(node[key]);
  }
}

function evaluate(node: any): StaticValue {
  switch (node?.type) {
    case 'Literal':
      if (node.value instanceof RegExp) throw new NotStatic('regex literal');
      return node.value as StaticValue;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) throw new NotStatic('template with expressions');
      return node.quasis.map((q: any) => q.value.cooked).join('');
    case 'UnaryExpression': {
      const arg = evaluate(node.argument);
      if (node.operator === '-' && typeof arg === 'number') return -arg;
      if (node.operator === '+' && typeof arg === 'number') return arg;
      if (node.operator === '!') return !arg;
      throw new NotStatic(`unary ${node.operator}`);
    }
    case 'ArrayExpression':
      return node.elements.map((el: any) => {
        if (el === null) throw new NotStatic('array hole');
        if (el.type === 'SpreadElement') throw new NotStatic('spread');
        return evaluate(el);
      });
    case 'ObjectExpression': {
      const out: { [k: string]: StaticValue } = {};
      for (const prop of node.properties) {
        if (prop.type !== 'Property') throw new NotStatic('object spread');
        if (prop.computed) throw new NotStatic('computed key');
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : prop.key.type === 'Literal'
              ? String(prop.key.value)
              : null;
        if (key === null) throw new NotStatic('non-literal key');
        out[key] = evaluate(prop.value);
      }
      return out;
    }
    default:
      throw new NotStatic(node?.type ?? 'unknown node');
  }
}

export interface ScriptLiterals {
  /** Every statically evaluable top-level-ish declaration, by variable name. */
  values: Map<string, StaticValue>;
  /** Names that were declared but are not static literals. */
  skipped: Map<string, string>;
}

/**
 * Parse `source` and collect every `const/let/var <name> = <literal>`
 * declaration whose initialiser is statically evaluable, at any nesting depth.
 */
export function extractLiterals(source: string): ScriptLiterals {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const values = new Map<string, StaticValue>();
  const skipped = new Map<string, string>();

  for (const node of walk(ast)) {
    if (node.type !== 'VariableDeclarator') continue;
    if (node.id?.type !== 'Identifier' || !node.init) continue;
    const name: string = node.id.name;
    if (values.has(name)) continue;
    try {
      values.set(name, evaluate(node.init));
    } catch (err) {
      skipped.set(name, err instanceof NotStatic ? err.message : String(err));
    }
  }
  return { values, skipped };
}

/** Shape of a raw answer key as it appears across the corpus. */
export type KeyShape = 'numeric-string' | 'q-prefixed-array' | 'q-prefixed-mixed' | 'q-prefixed-string' | 'unknown';

export interface AnswerKey {
  /** Question ordinal to its full accepted-answer list, first entry canonical. */
  entries: Map<number, string[]>;
  shape: KeyShape;
}

/**
 * Normalise a `correctAnswers` literal into ordinal -> accepted answers.
 * Handles both key forms ('1' and 'q1') and both value forms (string, array).
 */
export function normaliseAnswerKey(raw: StaticValue): AnswerKey {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entries: new Map(), shape: 'unknown' };
  }
  const entries = new Map<number, string[]>();
  let qPrefixed = 0;
  let numeric = 0;
  let arrays = 0;
  let strings = 0;

  for (const [key, value] of Object.entries(raw)) {
    const match = /^q?(\d+)$/i.exec(key);
    if (!match) continue;
    if (key.toLowerCase().startsWith('q')) qPrefixed++;
    else numeric++;
    const ordinal = Number(match[1]);

    let list: string[];
    if (Array.isArray(value)) {
      arrays++;
      list = value.filter((v): v is string => typeof v === 'string');
    } else if (typeof value === 'string') {
      strings++;
      list = [value];
    } else if (typeof value === 'number') {
      strings++;
      list = [String(value)];
    } else {
      continue;
    }
    entries.set(ordinal, list);
  }

  let shape: KeyShape = 'unknown';
  if (entries.size > 0) {
    if (numeric > 0 && qPrefixed === 0) shape = 'numeric-string';
    else if (qPrefixed > 0 && arrays > 0 && strings > 0) shape = 'q-prefixed-mixed';
    else if (qPrefixed > 0 && arrays > 0) shape = 'q-prefixed-array';
    else if (qPrefixed > 0) shape = 'q-prefixed-string';
  }
  return { entries, shape };
}
