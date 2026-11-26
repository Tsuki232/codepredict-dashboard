import type { ReactNode } from 'react'

const KEYWORDS = new Set(['def', 'return', 'if', 'else', 'elif', 'for', 'in', 'not', 'and', 'or', 'import', 'from', 'with', 'try', 'finally', 'lambda',
  'None', 'True', 'False', 'as', 'is', 'raise', 'while', 'class'])
const TOKEN = /(#[^\n]*)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g

/** Coloreado mínimo de Python (comentarios, textos, números y palabras reservadas). Es solo presentación. */
export function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(code.slice(last, at))
    const [tok, comment, str, num, word] = m
    if (comment) out.push(<span key={i++} className="tok-c">{tok}</span>)
    else if (str) out.push(<span key={i++} className="tok-s">{tok}</span>)
    else if (num) out.push(<span key={i++} className="tok-n">{tok}</span>)
    else if (word && KEYWORDS.has(word)) out.push(<span key={i++} className="tok-k">{tok}</span>)
    else out.push(tok)
    last = at + tok.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}
