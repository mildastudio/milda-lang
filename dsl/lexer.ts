// ─── Milda DSL lexer ──────────────────────────────────────────────────────────
// Tokenizes the concrete surface syntax (docs/dsl/GRAMMAR.ebnf) for the hand-written
// recursive-descent parser (./parse.ts). Zero-dependency; the executable PEG /
// tree-sitter tracks the spec mentions are deferred — this covers the authoring
// surface with precise source positions for diagnostics.
//
// Design notes on the tricky bits:
//   • `#` starts a line comment. Hex colors never appear bare — they are STRING
//     literals ("#ffffff") — so `#` outside a string is always a comment.
//   • `->` (and the unicode `→`) is the alias/wire arrow; it must be recognized
//     before a leading `-` is folded into a WORD.
//   • Newlines are significant: a statement ends at a NEWLINE or `;` (grammar
//     `terminator`). Consecutive newlines collapse to one NEWLINE token.
//   • A WORD is a run of identifier/path characters ([A-Za-z0-9_./-]) — the parser
//     later classifies it as a keyword, path, number, or bare ident by context.

export type TokenType =
  | 'word'
  | 'string'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'lt'
  | 'gt'
  | 'colon'
  | 'equals'
  | 'comma'
  | 'semi'
  | 'question'
  | 'arrow'
  | 'newline'
  | 'eof'

export interface Token {
  type: TokenType
  value: string
  pos: number
  line: number
  col: number
}

export class LexError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
  ) {
    super(`${message} (line ${line}:${col})`)
    this.name = 'LexError'
  }
}

const isWordChar = (c: string) => /[A-Za-z0-9_./%-]/.test(c)

const PUNCT: Record<string, TokenType> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '(': 'lparen',
  ')': 'rparen',
  '<': 'lt',
  '>': 'gt',
  ':': 'colon',
  '=': 'equals',
  ',': 'comma',
  ';': 'semi',
  '?': 'question',
}

export function lex(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  const n = src.length

  const advance = (count = 1) => {
    for (let k = 0; k < count; k++) {
      if (src[i] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
      i++
    }
  }

  const push = (type: TokenType, value: string, startPos: number, startLine: number, startCol: number) => {
    tokens.push({ type, value, pos: startPos, line: startLine, col: startCol })
  }

  while (i < n) {
    const c = src[i]
    const startPos = i
    const startLine = line
    const startCol = col

    // Newline → terminator (collapse runs into one).
    if (c === '\n') {
      advance()
      if (tokens.length && tokens[tokens.length - 1].type !== 'newline') {
        push('newline', '\n', startPos, startLine, startCol)
      }
      continue
    }

    // Other whitespace.
    if (c === ' ' || c === '\t' || c === '\r') {
      advance()
      continue
    }

    // Line comment.
    if (c === '#') {
      while (i < n && src[i] !== '\n') advance()
      continue
    }

    // String literal.
    if (c === '"') {
      advance()
      let value = ''
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const next = src[i + 1]
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          advance(2)
          continue
        }
        if (src[i] === '\n') throw new LexError('Unterminated string', startLine, startCol)
        value += src[i]
        advance()
      }
      if (i >= n) throw new LexError('Unterminated string', startLine, startCol)
      advance() // closing quote
      push('string', value, startPos, startLine, startCol)
      continue
    }

    // Arrow: `->` or unicode `→`.
    if (c === '-' && src[i + 1] === '>') {
      advance(2)
      push('arrow', '->', startPos, startLine, startCol)
      continue
    }
    if (c === '→') {
      advance()
      push('arrow', '->', startPos, startLine, startCol)
      continue
    }

    // Punctuation.
    if (PUNCT[c]) {
      advance()
      push(PUNCT[c], c, startPos, startLine, startCol)
      continue
    }

    // Word (ident / path / number).
    if (isWordChar(c)) {
      let value = ''
      // Guard: stop a word before a `->` so the arrow lexes separately.
      while (i < n && isWordChar(src[i]) && !(src[i] === '-' && src[i + 1] === '>')) {
        value += src[i]
        advance()
      }
      push('word', value, startPos, startLine, startCol)
      continue
    }

    // Unexpected character (e.g. `+`/`*` inside a motion expression the parser skips):
    // don't abort the whole file — skip it. Only unterminated strings hard-fail.
    advance()
  }

  push('eof', '', i, line, col)
  return tokens
}
