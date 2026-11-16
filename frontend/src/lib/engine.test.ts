import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { ADA_DOWN_EVENT, announceAdaDown, engineName, isAdaDownCode } from './engine'

describe('nombre del motor', () => {
  it('solo dice «Ada» cuando calculó Ada: Python local nunca se rotula como Ada', () => {
    expect(engineName({ mode: 'local' })).toBe('Ada')
    expect(engineName({ mode: 'remote' })).toBe('Ada')
    expect(engineName({ mode: 'python' })).toBe('Python local')
    expect(engineName(null)).toBe('Ada')
    expect(engineName(undefined)).toBe('Ada')
  })

  it('solo el código «ada_no_disponible» abre el modal; «cargando» no', () => {
    expect(isAdaDownCode('ada_no_disponible')).toBe(true)
    expect(isAdaDownCode('ada_cargando')).toBe(false)
    expect(isAdaDownCode(undefined)).toBe(false)
  })
})

describe('aviso de Ada caída desde la API', () => {
  let heard: string[]
  let target: EventTarget
  const listener = (e: Event) => heard.push((e as CustomEvent<{ message: string }>).detail.message)

  beforeEach(() => {
    heard = []
    target = new EventTarget()
    target.addEventListener(ADA_DOWN_EVENT, listener)
    vi.stubGlobal('window', Object.assign(target, { location: { reload: vi.fn() } }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))

  it('un 503 con code «ada_no_disponible» dispara el evento con el mensaje del servidor y el error conserva el code', async () => {
    respond(503, { detail: 'Ada remota no responde: el PC que corre Ada puede estar apagado o sin túnel.', code: 'ada_no_disponible' })
    await expect(api.profile()).rejects.toMatchObject({ status: 503, code: 'ada_no_disponible' })
    expect(heard).toEqual(['Ada remota no responde: el PC que corre Ada puede estar apagado o sin túnel.'])
  })

  it('un 503 «cargando», un 422 o un error sin código NO abren el modal', async () => {
    respond(503, { detail: 'Ada todavía se está cargando', code: 'ada_cargando' })
    await expect(api.profile()).rejects.toMatchObject({ status: 503, code: 'ada_cargando' })
    respond(422, { detail: 'reglas inválidas' })
    await expect(api.profile()).rejects.toMatchObject({ status: 422 })
    respond(500, {})
    await expect(api.profile()).rejects.toMatchObject({ status: 500 })
    expect(heard).toEqual([])
  })

  it('sin window (pruebas, servidor) avisar no falla', () => {
    vi.unstubAllGlobals()
    expect(() => announceAdaDown('x')).not.toThrow()
  })
})
