import { useRef } from 'react'

export interface ChoiceOption<T extends string> { value: T; title: string; hint: string; badge?: string }

/**
 * Elección única entre opciones con explicación (radio accesible: flechas mueven la selección, Tab entra y sale del grupo).
 * Se usa donde la decisión es del grupo y conviene leer qué implica cada opción.
 */
export function Choice<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: ChoiceOption<T>[]
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (to: number) => {
    const i = (to + options.length) % options.length
    onChange(options[i].value)
    refs.current[i]?.focus()
  }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i + 1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1) }
  }
  return (
    <div role="radiogroup" aria-label={label} className="choice">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on}
            tabIndex={on ? 0 : -1} className="choice-opt" onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)}>
            <span className="choice-dot" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[0.9375rem] font-semibold">{o.title}</span>
                {o.badge && <span className="small shrink-0 font-semibold">{o.badge}</span>}
              </span>
              <span className="small block">{o.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
