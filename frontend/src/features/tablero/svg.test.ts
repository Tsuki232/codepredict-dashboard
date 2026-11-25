import { describe, expect, it } from 'vitest'
import { indiceBanda, techo } from './svg'

describe('indiceBanda: qué barra queda bajo el cursor', () => {
  // 10 bandas de 50 unidades que empiezan en x = 100 (cubren de 100 a 600)
  const q = (x: number) => indiceBanda(x, 100, 50, 10)

  it('devuelve la banda que contiene la posición', () => {
    expect([q(100), q(124.9), q(125), q(149.99), q(150), q(575), q(599.9)]).toEqual([0, 0, 0, 0, 1, 9, 9])
  })

  it('fuera del área de trazado no hay banda', () => {
    expect([q(99.99), q(0), q(600), q(900), q(-5)]).toEqual([null, null, null, null, null])
  })

  it('una banda sin ancho o sin bandas nunca da un índice', () => {
    expect(indiceBanda(150, 100, 0, 10)).toBeNull()
    expect(indiceBanda(150, 100, 50, 0)).toBeNull()
    expect(indiceBanda(150, 100, Number.NaN, 10)).toBeNull()
  })
})

describe('techo: el máximo bonito del eje', () => {
  it('queda un poco por encima del dato más alto, en pasos de 1, 2, 2,5, 5 y 10 por una potencia de diez', () => {
    expect([techo(0.43), techo(0.62), techo(23), techo(100)]).toEqual([0.5, 1, 25, 200])     // el dato nunca queda pegado al borde
  })

  it('con datos no positivos devuelve 1 para no romper el eje', () => {
    expect([techo(0), techo(-3), techo(Number.NaN)]).toEqual([1, 1, 1])
  })
})
