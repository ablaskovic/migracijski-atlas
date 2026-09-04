#!/usr/bin/env node
/* Regex literals that lost a backslash.

   Twice now a working regex reached HEAD meaning something else, because the
   shell ate one level of escaping while the fix was being spliced in:
   exportPng's `/scale\(([\d.]+)\)/` became `/scale(([d.]+))/`, a capture of a
   capture of the letters d and ., which matches `scale` followed by one of them
   and never `scale(2.56)`; and verify.cjs's `/\s+/` became `/s+/`, the letter s,
   so a viewBox never split and the fallback branch ran every time.

   Neither tsc nor oxlint can see this. Both results are syntactically valid
   regexes; they simply mean something the author did not write. `no-useless-
   escape` is the opposite rule — it flags escapes that are not needed, not ones
   that are missing. So the guard has to be a reader of the literals themselves.

   What it looks for is the SHAPE the loss leaves: a class-shorthand letter
   standing where a shorthand was clearly meant — `[d.]`, `[dw]`, `(d+)`, `s+`,
   `w+`, `b` at a boundary position — with no backslash in front of it. It is a
   heuristic and it is allowed to be: the rule is that HEAD reports nothing, so
   any hit is either a real loss or a literal that should be spelled less
   ambiguously.

   Run directly (`node tools/regex-hunt.cjs`) or through the suite, which
   require()s scan() and fails on a non-empty result. Exit 1 on any hit. */
const fs = require('fs');
const path = require('path');

const ROOTS = ['src', 'scripts', 'tools'];
const EXT = /\.(?:ts|tsx|cjs|mjs|js)$/;

/* A regex literal, and only in the positions one can appear in. JavaScript
   cannot be tokenised for `/` without parsing, so this takes the conservative
   half: a `/` that follows an operator, an opening bracket, a comma, a keyword
   or the start of a line is a literal; one that follows an identifier, a closing
   bracket or a number is division and is skipped. That misses nothing this file
   is for — a regex literal is written in exactly those positions. */
const LITERAL = /(^|[(,=:[!&|?{};+\s])\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+)\/[dgimsuvy]*/g;

/* The four shapes a lost backslash leaves, and the one it leaves inside a
   class. Each is anchored so an intentional literal cannot trip it: `s+` only
   when it is not preceded by a backslash and not inside a longer word. */
const SUSPECT = [
  /* `[d.]`, `[.s]`, `[w-]` — a two-character class pairing a shorthand letter
     with a dot or a dash, which is what `[\d.]` becomes. Deliberately NOT "a
     class containing d": `/[Dd]nevne migracije/` is a real class of two real
     letters and this file must not cry wolf over it. */
  /* the dash is last in each class so it needs no escape — oxlint's
     no-useless-escape is on, and this file must pass the lint it guards */
  { re: /\[(?:[dsw][.-]|[.-][dsw])\]/, why: 'a shorthand letter paired with . or - in a class, as \\d. would be' },
  { re: /\((?<!\\)[dsw]\+\)/, why: 'a bare d/s/w quantified inside a group' },
  { re: /(?<![\\\w])[dsw]\+(?![\w])/, why: 'a bare d/s/w followed by +' },
  { re: /(?<![\\\w])[dsw]\*(?![\w])/, why: 'a bare d/s/w followed by *' },
];

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...files(p)); } else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

/** @returns {{file: string, line: number, src: string, why: string}[]} */
function scan(root = path.resolve(__dirname, '..')) {
  const hits = [];
  let n = 0;
  for (const r of ROOTS) {
    const dir = path.join(root, r);
    if (!fs.existsSync(dir)) continue;
    for (const f of files(dir)) {
      /* this file's own patterns ARE the shapes it hunts for */
      if (path.resolve(f) === path.resolve(__filename)) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(LITERAL)) {
        n++;
        const body = m[2];
        for (const s of SUSPECT) {
          if (s.re.test(body)) {
            hits.push({ file: path.relative(root, f).replace(/\\/g, '/'),
              line: text.slice(0, m.index).split('\n').length,
              src: '/' + body + '/', why: s.why });
            break;
          }
        }
      }
    }
  }
  return Object.assign(hits, { scanned: n });
}

module.exports = { scan };

if (require.main === module) {
  const hits = scan();
  console.log(`regex-hunt: ${hits.scanned} literals in ${ROOTS.join(', ')}`);
  for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.src}  — ${h.why}`);
  console.log(hits.length ? `\n${hits.length} suspect literal(s)` : 'no lost backslashes');
  process.exitCode = hits.length ? 1 : 0;
}
