/**
 * molang.js — évaluateur du langage d'expressions de Minecraft Bedrock.
 *
 * Cobblemon n'écrit pas ses animations de marche et de repos en keyframes :
 * il les écrit en formules, évaluées à chaque image par le jeu. Par exemple
 * `math.sin(query.anim_time * 90 * 1.2) * 3` pour un balancement de queue.
 *
 * Ce module compile ces formules en fonctions JavaScript, ce qui permet de
 * les échantillonner et d'en faire de vraies keyframes glTF.
 *
 * Limites assumées : pas de boucles, pas d'affectation à `variable.x` entre
 * deux instructions distinctes (les animations n'en utilisent pas), et les
 * requêtes inconnues valent 0.
 */

'use strict';

/* ---------- Analyse lexicale ---------- */

const PUNCTUATION = ['<=', '>=', '==', '!=', '&&', '||', '??', '(', ')', ',', '?', ':', ';', '+', '-', '*', '/', '<', '>', '!', '='];

/**
 * Molang admet des abréviations pour ses espaces de noms : Cobblemon écrit
 * `q.anim_time` et non `query.anim_time`. Sans cette expansion, la variable
 * n'est pas reconnue, vaut 0, et toutes les courbes sortent plates.
 */
const PREFIX_ALIASES = {
  q: 'query',
  v: 'variable',
  t: 'temp',
  c: 'context',
};

function expandPrefix(name) {
  const dot = name.indexOf('.');
  if (dot === -1) return name;
  const expanded = PREFIX_ALIASES[name.slice(0, dot)];
  return expanded ? `${expanded}${name.slice(dot)}` : name;
}

function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) { i++; continue; }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j++;
      tokens.push({ type: 'number', value: parseFloat(source.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let j = i;
      // Les identifiants Molang sont pointés : query.anim_time, math.sin…
      while (j < source.length && /[A-Za-z0-9_.]/.test(source[j])) j++;
      tokens.push({ type: 'name', value: expandPrefix(source.slice(i, j).toLowerCase()) });
      i = j;
      continue;
    }

    if (char === "'") {
      const end = source.indexOf("'", i + 1);
      if (end === -1) throw new Error(`Chaîne non terminée dans « ${source} »`);
      tokens.push({ type: 'string', value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    const punct = PUNCTUATION.find((p) => source.startsWith(p, i));
    if (punct) {
      tokens.push({ type: 'punct', value: punct });
      i += punct.length;
      continue;
    }

    throw new Error(`Caractère inattendu « ${char} » dans « ${source} »`);
  }

  tokens.push({ type: 'end', value: null });
  return tokens;
}

/* ---------- Analyse syntaxique ---------- */

/** Du plus faible au plus fort. Le ternaire est traité à part. */
const BINARY_PRECEDENCE = {
  '??': 1,
  '||': 2, '&&': 3,
  '==': 4, '!=': 4, '<': 5, '>': 5, '<=': 5, '>=': 5,
  '+': 6, '-': 6,
  '*': 7, '/': 7,
};

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (value) => {
    const token = tokens[pos];
    if (token.value !== value) throw new Error(`Attendu « ${value} », trouvé « ${token.value} »`);
    pos++;
    return token;
  };

  function parseExpression(minPrecedence = 0) {
    let left = parseUnary();

    for (;;) {
      const token = peek();
      if (token.type !== 'punct') break;

      if (token.value === '?' && minPrecedence <= 0) {
        pos++;
        const whenTrue = parseExpression(0);
        // Molang autorise `a ? b` sans branche « sinon » : elle vaut alors 0.
        let whenFalse = { kind: 'number', value: 0 };
        if (peek().value === ':') {
          pos++;
          whenFalse = parseExpression(0);
        }
        left = { kind: 'ternary', condition: left, whenTrue, whenFalse };
        continue;
      }

      const precedence = BINARY_PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      pos++;
      const right = parseExpression(precedence + 1);
      left = { kind: 'binary', op: token.value, left, right };
    }

    return left;
  }

  function parseUnary() {
    const token = peek();
    if (token.type === 'punct' && (token.value === '-' || token.value === '!')) {
      pos++;
      return { kind: 'unary', op: token.value, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();

    if (token.type === 'number') { pos++; return { kind: 'number', value: token.value }; }
    if (token.type === 'string') { pos++; return { kind: 'string', value: token.value }; }

    if (token.type === 'punct' && token.value === '(') {
      pos++;
      const inner = parseExpression(0);
      eat(')');
      return inner;
    }

    if (token.type === 'name') {
      pos++;
      const name = token.value;
      if (peek().type === 'punct' && peek().value === '(') {
        pos++;
        const args = [];
        if (peek().value !== ')') {
          args.push(parseExpression(0));
          while (peek().value === ',') { pos++; args.push(parseExpression(0)); }
        }
        eat(')');
        return { kind: 'call', name, args };
      }
      return { kind: 'variable', name };
    }

    throw new Error(`Expression inattendue près de « ${token.value} »`);
  }

  // Molang accepte plusieurs instructions séparées par « ; ».
  const statements = [];
  for (;;) {
    if (peek().type === 'end') break;
    if (peek().type === 'punct' && peek().value === ';') { pos++; continue; }
    if (peek().type === 'name' && peek().value === 'return') {
      pos++;
      statements.push({ kind: 'return', value: parseExpression(0) });
      continue;
    }
    statements.push({ kind: 'expression', value: parseExpression(0) });
  }

  return statements;
}

/* ---------- Évaluation ---------- */

const bool = (value) => (value ? 1 : 0);
const RAD = Math.PI / 180;

/** Les fonctions trigonométriques de Molang travaillent en degrés. */
const FUNCTIONS = {
  'math.abs': (x) => Math.abs(x),
  'math.acos': (x) => Math.acos(x) / RAD,
  'math.asin': (x) => Math.asin(x) / RAD,
  'math.atan': (x) => Math.atan(x) / RAD,
  'math.atan2': (y, x) => Math.atan2(y, x) / RAD,
  'math.ceil': (x) => Math.ceil(x),
  'math.clamp': (x, min, max) => Math.min(Math.max(x, min), max),
  'math.cos': (x) => Math.cos(x * RAD),
  'math.exp': (x) => Math.exp(x),
  'math.floor': (x) => Math.floor(x),
  'math.hermite_blend': (t) => 3 * t * t - 2 * t * t * t,
  'math.lerp': (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1),
  'math.ln': (x) => Math.log(x),
  'math.max': (a, b) => Math.max(a, b),
  'math.min': (a, b) => Math.min(a, b),
  'math.mod': (a, b) => a % b,
  'math.pow': (a, b) => Math.pow(a, b),
  'math.round': (x) => Math.round(x),
  'math.sin': (x) => Math.sin(x * RAD),
  'math.sqrt': (x) => Math.sqrt(x),
  'math.trunc': (x) => Math.trunc(x),
  // Déterministes volontairement : une animation doit être reproductible
  // d'une conversion à l'autre, sinon les keyframes changent à chaque run.
  'math.random': (low = 0, high = 1) => (low + high) / 2,
  'math.random_integer': (low = 0, high = 1) => Math.round((low + high) / 2),
  'math.die_roll': (n, low, high) => (n * (low + high)) / 2,
  'math.die_roll_integer': (n, low, high) => Math.round((n * (low + high)) / 2),
  'math.lerprotate': (a, b, t) => {
    let delta = ((b - a) % 360 + 540) % 360 - 180;
    return a + delta * Math.min(Math.max(t, 0), 1);
  },
};

function evaluateNode(node, context) {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return 0; // les chaînes ne servent qu'aux comparaisons d'états, absentes ici
    case 'variable': {
      const value = context[node.name];
      return typeof value === 'number' ? value : 0;
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Fonction Molang non gérée : ${node.name}`);
      return fn(...node.args.map((arg) => evaluateNode(arg, context)));
    }
    case 'unary':
      return node.op === '-' ? -evaluateNode(node.operand, context) : bool(!evaluateNode(node.operand, context));
    case 'ternary':
      return evaluateNode(node.condition, context)
        ? evaluateNode(node.whenTrue, context)
        : evaluateNode(node.whenFalse, context);
    case 'binary': {
      const a = evaluateNode(node.left, context);
      if (node.op === '&&') return bool(a && evaluateNode(node.right, context));
      if (node.op === '||') return bool(a || evaluateNode(node.right, context));
      if (node.op === '??') return a;
      const b = evaluateNode(node.right, context);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;
        case '<': return bool(a < b);
        case '>': return bool(a > b);
        case '<=': return bool(a <= b);
        case '>=': return bool(a >= b);
        case '==': return bool(a === b);
        case '!=': return bool(a !== b);
        default: throw new Error(`Opérateur non géré : ${node.op}`);
      }
    }
    default:
      throw new Error(`Nœud non géré : ${node.kind}`);
  }
}

const cache = new Map();

/**
 * Compile une expression Molang.
 * @param {string|number} source
 * @returns {(context: Record<string, number>) => number}
 */
function compile(source) {
  if (typeof source === 'number') return () => source;
  const key = source;
  let compiled = cache.get(key);
  if (compiled) return compiled;

  const statements = parse(tokenize(source));
  compiled = (context) => {
    let last = 0;
    for (const statement of statements) {
      last = evaluateNode(statement.value, context);
      if (statement.kind === 'return') return last;
    }
    return last;
  };
  cache.set(key, compiled);
  return compiled;
}

/** Vrai si la valeur contient au moins une expression à évaluer. */
function isExpression(value) {
  return typeof value === 'string';
}

module.exports = { compile, isExpression, tokenize, parse, FUNCTIONS };
