/**
 * Arithmetic evaluator for the calculator tool.
 *
 * Deliberately a hand-written parser rather than `eval` or `new Function`. The
 * expression comes from the model, which can be steered by injected text in
 * retrieved content — so this input is untrusted by construction, and handing
 * it to a JS evaluator on the server would be a remote code execution path.
 *
 * A recursive-descent parser over a fixed grammar can only ever produce a
 * number. There is no escape hatch to reach for.
 *
 * Supports: + - * / % ^, parentheses, unary minus, and a small function set.
 */

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    exp: Math.exp,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    e: Math.E,
};

const MAX_LENGTH = 500;

type Token = { type: "num"; value: number } | { type: "op" | "paren" | "ident" | "comma"; value: string };

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        const c = input[i];

        if (/\s/.test(c)) { i++; continue; }

        if (/[0-9.]/.test(c)) {
            let j = i;
            while (j < input.length && /[0-9._]/.test(input[j])) j++;
            // Underscores as digit separators, as people write them.
            const raw = input.slice(i, j).replace(/_/g, "");
            const value = Number(raw);
            if (!Number.isFinite(value)) throw new Error(`Not a number: ${raw}`);
            tokens.push({ type: "num", value });
            i = j;
            continue;
        }

        if (/[a-zA-Z]/.test(c)) {
            let j = i;
            while (j < input.length && /[a-zA-Z0-9]/.test(input[j])) j++;
            tokens.push({ type: "ident", value: input.slice(i, j).toLowerCase() });
            i = j;
            continue;
        }

        if ("+-*/%^".includes(c)) { tokens.push({ type: "op", value: c }); i++; continue; }
        if (c === "(" || c === ")") { tokens.push({ type: "paren", value: c }); i++; continue; }
        if (c === ",") { tokens.push({ type: "comma", value: c }); i++; continue; }

        throw new Error(`Unexpected character: ${c}`);
    }

    return tokens;
}

export function evaluateExpression(input: string): number {
    if (typeof input !== "string") throw new Error("Expression must be a string");
    if (input.length > MAX_LENGTH) throw new Error("Expression is too long");

    const tokens = tokenize(input);
    if (tokens.length === 0) throw new Error("Empty expression");

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    // expression := term (('+' | '-') term)*
    function parseExpression(): number {
        let left = parseTerm();
        while (peek()?.type === "op" && "+-".includes(peek().value as string)) {
            const op = next().value;
            const right = parseTerm();
            left = op === "+" ? left + right : left - right;
        }
        return left;
    }

    // term := factor (('*' | '/' | '%') factor)*
    function parseTerm(): number {
        let left = parseFactor();
        while (peek()?.type === "op" && "*/%".includes(peek().value as string)) {
            const op = next().value;
            const right = parseFactor();
            if ((op === "/" || op === "%") && right === 0) throw new Error("Division by zero");
            left = op === "*" ? left * right : op === "/" ? left / right : left % right;
        }
        return left;
    }

    // factor := unary ('^' factor)?   — right-associative
    function parseFactor(): number {
        const base = parseUnary();
        if (peek()?.type === "op" && peek().value === "^") {
            next();
            return Math.pow(base, parseFactor());
        }
        return base;
    }

    function parseUnary(): number {
        if (peek()?.type === "op" && (peek().value === "-" || peek().value === "+")) {
            const op = next().value;
            const v = parseUnary();
            return op === "-" ? -v : v;
        }
        return parsePrimary();
    }

    function parsePrimary(): number {
        const t = next();
        if (!t) throw new Error("Unexpected end of expression");

        if (t.type === "num") return t.value;

        if (t.type === "paren" && t.value === "(") {
            const v = parseExpression();
            const close = next();
            if (!close || close.value !== ")") throw new Error("Missing closing parenthesis");
            return v;
        }

        if (t.type === "ident") {
            if (t.value in CONSTANTS) return CONSTANTS[t.value];

            const fn = FUNCTIONS[t.value];
            if (!fn) throw new Error(`Unknown function: ${t.value}`);

            const open = next();
            if (!open || open.value !== "(") throw new Error(`Expected ( after ${t.value}`);

            const args: number[] = [];
            if (peek()?.value !== ")") {
                args.push(parseExpression());
                while (peek()?.type === "comma") { next(); args.push(parseExpression()); }
            }
            const close = next();
            if (!close || close.value !== ")") throw new Error("Missing closing parenthesis");

            return fn(...args);
        }

        throw new Error(`Unexpected token: ${t.value}`);
    }

    const result = parseExpression();
    if (pos < tokens.length) throw new Error(`Unexpected trailing input: ${tokens[pos].value}`);
    if (!Number.isFinite(result)) throw new Error("Result is not a finite number");

    return result;
}
