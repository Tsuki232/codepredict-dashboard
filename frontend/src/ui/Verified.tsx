import { Check, TriangleAlert } from 'lucide-react'

/** Sello de verificación: siempre con símbolo y texto (el color solo acompaña). */
export function Verified({ ok, label, methods }: { ok: boolean | null; label?: string; methods?: string[] }) {
  if (ok === null) return null
  const color = ok ? 'var(--ok)' : 'var(--bad)'
  const text = label ?? (ok ? 'Verificado' : 'No coincide')
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[0.75rem] font-semibold"
      style={{ color, borderColor: 'currentColor' }} title={methods?.join(' · ')}>
      {ok ? <Check size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />} {text}
    </span>
  )
}
