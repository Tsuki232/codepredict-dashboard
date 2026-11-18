// «Ada en vivo»: dibuja lo que pasa de verdad. Solo se anima algo cuando llega o termina una petición real; en reposo todo queda quieto.
import {
  GRUPOS, duracion, enVuelo, entero, frase, grupoDe, hace, haciendo, hora, nombreRuta, num, percentil, persona, porMinuto, resumen, terminadas, tieneVias, usoDeCupos, viasCortas,
} from './logica.js'

const NS = 'http://www.w3.org/2000/svg'
const $ = (sel, raiz = document) => raiz.querySelector(sel)
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches
const ahora = () => Date.now() / 1000

function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}

function s(tag, attrs = {}, ...hijos) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v)
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}

const E = { eventos: [], sistema: null, historial: { gpu: [], cpu: [], vram: [] }, filtro: 'todo', abiertas: new Set(), tabla: false }
const MAX_EVENTOS = 2500
const ORDEN = ['stats', 'pendulo', 'cp', 'explicar', 'otro']

// ----------------------------------------------------------------------------- tooltip (un solo elemento; los datos van en data-tip)

const tip = $('#tip')
document.addEventListener('mouseover', (ev) => {
  const t = ev.target.closest?.('[data-tip]')
  if (!t) { tip.hidden = true; return }
  tip.innerHTML = t.getAttribute('data-tip')
  tip.hidden = false
})
document.addEventListener('mousemove', (ev) => {
  if (tip.hidden) return
  const w = tip.offsetWidth, hh = tip.offsetHeight
  tip.style.left = `${Math.min(ev.clientX + 14, innerWidth - w - 8)}px`
  tip.style.top = `${ev.clientY + 16 + hh > innerHeight ? ev.clientY - hh - 12 : ev.clientY + 16}px`
})
document.addEventListener('mouseleave', () => { tip.hidden = true })

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ----------------------------------------------------------------------------- iconos de estado (siempre con texto al lado: el color solo acompaña)

function icono(tipo, tam = 22) {
  const base = { width: tam, height: tam, viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  const color = { ok: 'var(--bien)', aviso: 'var(--aviso)', mal: 'var(--critico)', apagado: 'var(--apagado)' }[tipo]
  const g = {
    ok: [s('circle', { cx: 12, cy: 12, r: 9.5 }), s('path', { d: 'M7.5 12.5l3 3 6-6.5' })],
    aviso: [s('path', { d: 'M12 3.5l9.5 16.5h-19z' }), s('path', { d: 'M12 10v4.5M12 17.4v.1' })],
    mal: [s('circle', { cx: 12, cy: 12, r: 9.5 }), s('path', { d: 'M8.5 8.5l7 7M15.5 8.5l-7 7' })],
    apagado: [s('circle', { cx: 12, cy: 12, r: 9.5, 'stroke-dasharray': '3 3' })],
  }[tipo]
  return s('svg', { ...base, stroke: color }, g)
}

// ----------------------------------------------------------------------------- piezas

function pintarPiezas() {
  const sis = E.sistema
  const caja = $('#piezas')
  const items = []
  if (!sis) {
    for (const n of ['Puerta de enlace', 'Túnel de Cloudflare', 'Ollama', 'Motor de Ada', 'Tarjeta gráfica']) items.push({ n, v: 'Consultando…', e: 'apagado' })
  } else {
    const p = sis.puerta
    const desde = p.proceso?.desde ? ` · encendida ${hace(ahora() - p.proceso.desde)}` : ''
    items.push(p.activa ? { n: 'Puerta de enlace', v: `En marcha${desde}`, e: 'ok' } : { n: 'Puerta de enlace', v: 'Apagada: nadie puede conectarse', e: 'mal' })
    items.push(sis.tunel.activo ? { n: 'Túnel de Cloudflare', v: `En marcha${sis.tunel.proceso?.desde ? ` desde ${hace(ahora() - sis.tunel.proceso.desde)}` : ''}`, e: 'ok' }
      : { n: 'Túnel de Cloudflare', v: 'Apagado: los compañeros no llegan', e: 'mal' })
    const o = sis.ollama
    items.push(!o.activo ? { n: 'Ollama (modelo de lenguaje)', v: 'Apagado: el asistente de texto no responde', e: 'mal' }
      : o.modelos.length ? { n: 'Ollama (modelo de lenguaje)', v: `${o.modelos[0].nombre} cargado · ${(o.modelos[0].vram_mb / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} GB de GPU`, e: 'ok' }
        : { n: 'Ollama (modelo de lenguaje)', v: 'En marcha; el modelo se carga al usarlo', e: 'ok' })
    items.push(!p.activa ? { n: 'Motor de Ada', v: 'Sin la puerta de enlace no hay motor', e: 'apagado' }
      : p.motor === 'listo' ? { n: 'Motor de Ada', v: 'Listo: estadística, limpieza y péndulo', e: 'ok' }
        : p.motor === 'cargando' ? { n: 'Motor de Ada', v: 'Cargándose; responde 503 mientras tanto', e: 'aviso' }
          : { n: 'Motor de Ada', v: `Con problemas (${p.motor ?? 'sin dato'})`, e: 'mal' })
    const g = sis.gpu
    items.push(g ? { n: 'Tarjeta gráfica', v: `${g.nombre.replace('NVIDIA GeForce ', '')} · ${num(g.uso, 3)} % · ${num(g.temp_c, 3)} °C`, e: g.temp_c >= 85 ? 'aviso' : 'ok' }
      : { n: 'Tarjeta gráfica', v: 'No se pudo leer (nvidia-smi no responde)', e: 'aviso' })
  }
  caja.replaceChildren(...items.map((it) => h('div', { class: 'pieza' }, icono(it.e), h('span', { class: 'nombre' }, it.n),
    h('span', { class: `valor estado-${it.e}` }, it.v))))
}

// ----------------------------------------------------------------------------- el recorrido

const X = { comp: 100, tunel: 340, puerta: 580, ada: 820, vias: 1060 }
const Y = 130
const X_DENTRO = 700           // dentro del servidor (entre la puerta y Ada): donde espera una petición mientras se atiende
const fichas = new Map()

function construirRecorrido() {
  const svg = $('#recorrido')
  const nodo = (id, cx, titulo, icono2) => s('g', { class: 'nodo', id: `n-${id}` },
    s('rect', { x: cx - 75, y: Y - 35, width: 150, height: 70, rx: 10 }), icono2,
    s('text', { class: 't', x: cx, y: Y + 62 }, titulo), s('text', { class: 'c', id: `c1-${id}`, x: cx, y: Y + 82 }, ''), s('text', { class: 'c', id: `c2-${id}`, x: cx, y: Y + 99 }, ''))
  const cabezas = [-22, 0, 22].map((dx) => s('g', {}, s('circle', { cx: X.comp + dx, cy: Y - 9, r: 7, fill: 'var(--tinta-2)' }), s('path', { d: `M${X.comp + dx - 10} ${Y + 17}a10 9 0 0 1 20 0z`, fill: 'var(--tinta-2)' })))
  const arco = s('path', { d: `M${X.tunel - 30} ${Y + 20}V${Y - 4}a30 30 0 0 1 60 0V${Y + 20}`, fill: 'none', stroke: 'var(--tinta-2)', 'stroke-width': 3, 'stroke-linecap': 'round' })
  const reja = s('g', { stroke: 'var(--tinta-2)', 'stroke-width': 3, 'stroke-linecap': 'round' }, s('path', { d: `M${X.puerta - 28} ${Y - 18}v38M${X.puerta - 9} ${Y - 18}v38M${X.puerta + 9} ${Y - 18}v38M${X.puerta + 28} ${Y - 18}v38M${X.puerta - 32} ${Y - 6}h64M${X.puerta - 32} ${Y + 10}h64` }))
  const sigma = s('text', { x: X.ada, y: Y + 14, 'text-anchor': 'middle', 'font-size': 44, 'font-family': 'var(--letra-titulo)', 'font-weight': 600, fill: 'var(--tinta)' }, 'Σ')

  const marcas = []
  for (let x = X.comp + 80; x < X.vias - 80; x += 24) marcas.push(s('line', { class: 'marca-r', x1: x, y1: Y - 4, x2: x, y2: Y + 4 }))
  const cota = (x1, x2, y, texto) => s('g', {}, s('path', { class: 'cota', d: `M${x1} ${y + 8}V${y}H${x2}V${y + 8}` }), s('text', { class: 'cota-t', x: (x1 + x2) / 2, y: y - 7 }, texto))

  svg.replaceChildren(
    cota(35, 262, 30, 'Internet'), cota(278, 1165, 30, 'Dentro de este PC'),
    s('line', { class: 'eje-r', x1: X.comp + 78, y1: Y, x2: X.vias - 78, y2: Y }), ...marcas,
    nodo('comp', X.comp, 'Compañeros', s('g', {}, cabezas)), nodo('tunel', X.tunel, 'Túnel de Cloudflare', arco),
    nodo('puerta', X.puerta, 'Puerta de enlace', reja), nodo('ada', X.ada, 'Ada calcula', sigma),
    nodo('vias', X.vias, 'Dos vías', s('g', { id: 'g-vias' })),
    s('text', { class: 'cota-t', x: X_DENTRO, y: Y - 48 }, 'en servicio'),
    s('g', { id: 'capa-fichas' }),
  )
  pintarVias(null)
}

/** Las dos vías de una verificación: un trazo continuo (primer método) y uno punteado (segundo) que se juntan en un visto bueno… o no. */
function trazosVias(ev, ancho = 120, alto = 44, x0 = 0, y0 = 0, animar = false) {
  const bien = ev?.d?.verificado !== false
  const yA = y0 + alto * 0.22, yB = y0 + alto * 0.78, ym = y0 + alto / 2, xf = x0 + ancho * 0.62
  const a = s('path', { class: 'via-a', d: bien ? `M${x0} ${yA}C${x0 + ancho * 0.35} ${yA} ${xf - 20} ${ym} ${xf} ${ym}` : `M${x0} ${yA}C${x0 + ancho * 0.35} ${yA} ${xf - 20} ${yA + 4} ${xf} ${yA + 5}`, pathLength: 1 })
  const b = s('path', { class: 'via-b', d: bien ? `M${x0} ${yB}C${x0 + ancho * 0.35} ${yB} ${xf - 20} ${ym} ${xf} ${ym}` : `M${x0} ${yB}C${x0 + ancho * 0.35} ${yB} ${xf - 20} ${yB - 4} ${xf} ${yB - 5}` })
  const marcaA = s('circle', { cx: x0, cy: yA, r: 4.5, fill: 'var(--tinta)' })
  const marcaB = s('rect', { x: x0 - 4.5, y: yB - 4.5, width: 9, height: 9, fill: 'var(--tinta)' })
  const cx = x0 + ancho * 0.82
  const sello = bien
    ? s('g', {}, s('line', { x1: xf, y1: ym, x2: cx - 11, y2: ym, class: 'via-a' }), s('circle', { cx, cy: ym, r: 11, fill: 'none', stroke: 'var(--bien)', 'stroke-width': 3 }), s('path', { class: 'ok-marca', d: `M${cx - 5} ${ym}l3.5 3.5 6.5-7` }))
    : s('g', {}, s('circle', { cx, cy: ym, r: 11, fill: 'none', stroke: 'var(--critico)', 'stroke-width': 3 }), s('path', { class: 'mal-marca', d: `M${cx - 4.5} ${ym - 4.5}l9 9M${cx + 4.5} ${ym - 4.5}l-9 9` }))
  if (animar && !reducir) {
    a.animate([{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 650, easing: 'ease-out', fill: 'both' })
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, delay: 120, fill: 'both' })
    sello.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: 650, easing: 'ease-out', fill: 'both' })
  }
  return [a, b, marcaA, marcaB, sello]
}

function pintarVias(ev, animar = false) {
  const g = $('#g-vias')
  if (!g) return
  g.replaceChildren(...(ev ? trazosVias(ev, 118, 44, X.vias - 59, Y - 22, animar) : [s('text', { x: X.vias, y: Y + 5, 'text-anchor': 'middle', fill: 'var(--apagado)', 'font-size': 12 }, 'sin resultados todavía')]))
  const [v1, v2] = ev ? viasCortas(ev.d.vias) : ['', '']
  $('#c1-vias').textContent = ev ? `${v1} y` : ''
  $('#c2-vias').textContent = ev ? v2 : ''
}

function posicionFicha(i) {
  return { x: X_DENTRO, y: Y + [0, -18, 18, -34, 34][i % 5] }
}

function moverFicha(f, x, y, ms, opacidad = 1) {
  const de = f.pos
  f.pos = { x, y }
  const a = f.g.animate([{ transform: `translate(${de.x}px, ${de.y}px)`, opacity: f.opa }, { transform: `translate(${x}px, ${y}px)`, opacity: opacidad }],
    { duration: reducir ? 0 : ms, easing: 'ease-in-out', fill: 'forwards' })
  f.opa = opacidad
  return a.finished.catch(() => {})
}

function crearFicha(ev, enSitio) {
  const color = GRUPOS[grupoDe(ev)].color
  const g = s('g', { class: 'ficha' }, s('circle', { r: 8, fill: color }), s('text', { y: 24 }, ''))
  $('#capa-fichas').append(g)
  const f = { g, pos: { x: X.comp, y: Y }, opa: 0, cola: Promise.resolve(), ev }
  g.style.transform = `translate(${X.comp}px, ${Y}px)`
  fichas.set(ev.id, f)
  if (enSitio) { const p = posicionFicha(fichas.size); f.pos = p; f.opa = 1; g.style.transform = `translate(${p.x}px, ${p.y}px)` } else f.cola = f.cola.then(() => moverFicha(f, X_DENTRO, posicionFicha(fichas.size).y, 900, 1))
  return f
}

function alLlegar(ev, enSitio = false) {
  if (!fichas.has(ev.id)) crearFicha(ev, enSitio)
}

function alTerminar(ev) {
  const f = fichas.get(ev.id) ?? crearFicha({ ...ev }, true)
  f.cola = f.cola.then(async () => {
    $('text', f.g).textContent = ''
    if (ev.estado < 400) {
      await moverFicha(f, X.vias, Y, 650)
      if (tieneVias(ev)) pintarVias(ev, true)
      await moverFicha(f, X.comp, Y, 800, 0)
    } else {
      $('circle', f.g).setAttribute('fill', 'var(--critico)')
      await moverFicha(f, X.comp, Y, 800, 0)
    }
    f.g.remove()
    fichas.delete(ev.id)
  })
}

function pintarContadores() {
  const r = resumen(E.eventos, ahora())
  const en = enVuelo(E.eventos, ahora())
  const t = (id, a, b) => { const c1 = $(`#c1-${id}`), c2 = $(`#c2-${id}`); if (c1 && id !== 'vias') c1.textContent = a; if (c2 && id !== 'vias') c2.textContent = b }
  t('comp', `${r.clientes10min} ${r.clientes10min === 1 ? 'persona' : 'personas'} en 10 min`, `${entero(r.total)} peticiones en total`)
  t('tunel', `${entero(r.porTunel)} llegaron por el túnel`, `${entero(r.locales)} desde este PC`)
  t('puerta', `${entero(r.rechazadas)} rechazadas`, 'clave, tamaño y cupo')
  t('ada', en.length ? `${en.length} en curso` : 'en reposo', r.medianaMs === null ? 'sin datos aún' : `mediana ${duracion(r.medianaMs)}`)
  $('#n-ada')?.classList.toggle('ocupado', en.length > 0)
  const vias = $('#c2-vias')
  if (vias && !vias.textContent) vias.textContent = r.verificadas ? `${entero(r.verificadas)} verificadas ✓` : ''
  const ult = terminadas(E.eventos).filter((e) => tieneVias(e)).at(-1)
  if (ult && $('#c1-vias') && !$('#c1-vias').textContent) pintarVias(ult)
  const caja = $('#resumen')
  if (!r.total) { caja.textContent = 'Todavía no hay peticiones registradas. Cuando un compañero use el panel, aparecerán aquí.'; return }
  caja.replaceChildren(h('strong', {}, entero(r.total)), ' peticiones registradas: ', h('strong', {}, entero(r.verificadas)), ' verificadas por dos vías, ',
    h('strong', {}, entero(r.rechazadas)), ' rechazadas, mediana ', h('strong', {}, duracion(r.medianaMs)), '.',
    r.noCoinciden ? h('strong', { class: 'estado-mal' }, ` ¡${r.noCoinciden} con las dos vías sin coincidir!`) : '')
}

// ----------------------------------------------------------------------------- qué hace Ada ahora / lo último verificado

function pintarAhora() {
  const caja = $('#ahora')
  const en = enVuelo(E.eventos, ahora())
  if (!en.length) {
    const ult = terminadas(E.eventos).at(-1)
    caja.replaceChildren(h('div', { class: 'vacio' }, h('strong', {}, 'Ada está en reposo.'),
      ult ? `La última petición terminó ${hace(ahora() - ult.t)}.` : 'Todavía no ha recibido ninguna petición desde que se encendió el registro.'))
    return
  }
  caja.replaceChildren(h('ul', { class: 'lista' }, en.map((ev) => h('li', { class: 'fila' },
    h('span', { class: 'que' }, h('span', { class: 'punto', style: `background:${GRUPOS[grupoDe(ev)].color}` }), haciendo(ev.ruta)),
    h('span', { class: 'cuanto num', 'data-t': ev.t }, duracion((ahora() - ev.t) * 1000)),
    h('span', { class: 'quien' }, `${persona(ev.cliente)} · ${ev.origen === 'tunel' ? 'por el túnel' : 'desde este PC'}`)))))
}

function pintarVerificado() {
  const caja = $('#verificado')
  const lista = terminadas(E.eventos).filter(tieneVias).slice(-6).reverse()
  if (!lista.length) { caja.replaceChildren(h('div', { class: 'vacio' }, h('strong', {}, 'Todavía no hay resultados verificados.'), 'Aparecerán cuando Ada resuelva una petición.')); return }
  caja.replaceChildren(...lista.map((ev) => {
    const d = ev.d
    const bien = d.verificado !== false
    const [v1, v2] = viasCortas(d.vias)
    const svg = s('svg', { viewBox: '0 0 150 44', role: 'img', 'aria-label': bien ? 'Las dos vías coinciden' : 'Las dos vías no coinciden' }, ...trazosVias(ev, 140, 44, 4, 0, false))
    return h('div', { class: 'verif' },
      h('div', { class: 'cifras' }, nombreRuta(ev.ruta)),
      svg,
      h('div', { class: 'detalle' }, frase(ev).replace(/ · (dos vías coinciden ✓|¡las dos vías NO coinciden!)$/, '')),
      h('div', { class: `sello ${bien ? 'estado-ok' : 'estado-mal'}` }, icono(bien ? 'ok' : 'mal', 16),
        bien ? `Las dos vías coinciden${d.discrepancia != null ? ` · diferencia: ${num(d.discrepancia, 2)}` : ''} · ${v1} y ${v2}` : `¡Las dos vías NO coinciden! No uses este resultado · ${v1} y ${v2}`))
  }))
}

// ----------------------------------------------------------------------------- gráficas

function paso(max) {
  const c = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  return c.find((x) => max / x <= 4) ?? 1000
}

function graficaMinuto() {
  const W = 640, H = 250, L = 40, R = 8, T = 14, B = 34
  const cubos = porMinuto(E.eventos, ahora(), 30)
  const maxReal = Math.max(...cubos.map((c) => c.total))
  const pas = paso(Math.max(4, maxReal))
  const tope = Math.max(pas * 2, Math.ceil(Math.max(4, maxReal) / pas) * pas)
  const iw = W - L - R, ih = H - T - B, bw = iw / 30
  const y = (v) => T + ih - (v / tope) * ih
  const partes = []
  for (let v = 0; v <= tope; v += pas) partes.push(s('line', { class: v ? 'rejilla' : 'eje-g', x1: L, x2: W - R, y1: y(v), y2: y(v) }), s('text', { class: 'fin', x: L - 6, y: y(v) + 4 }, v))
  const etiquetas = { 0: 'hace 30 min', 10: 'hace 20', 20: 'hace 10', 29: 'ahora' }
  Object.entries(etiquetas).forEach(([i, t]) => partes.push(s('text', { class: 'med', x: L + bw * Number(i) + bw / 2, y: H - 12 }, t)))
  cubos.forEach((c, i) => {
    let acum = 0
    const x = L + bw * i + 2
    const ancho = Math.max(3, bw - 4)
    const hora0 = new Date(c.t0 * 1000).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })
    const detalle = ORDEN.filter((g) => c.grupos[g]).map((g) => `${GRUPOS[g].nombre}: <b>${c.grupos[g]}</b>`).join('<br>')
    const tipTxt = `<b>${hora0}</b> · ${c.total} ${c.total === 1 ? 'petición' : 'peticiones'}${detalle ? `<br>${detalle}` : ''}${c.rechazadas ? `<br>✕ Rechazadas: ${c.rechazadas}` : ''}`
    for (const g of ORDEN) {
      const n = c.grupos[g] ?? 0
      if (!n) continue
      const y1 = y(acum + n), alto = y(acum) - y1
      partes.push(s('rect', { class: 'barra', x, y: y1, width: ancho, height: Math.max(alto, 2), rx: 2, fill: GRUPOS[g].color, 'data-tip': tipTxt }))
      acum += n
    }
    if (c.total === 0) partes.push(s('rect', { x, y: y(0) - 8, width: ancho, height: 8, fill: 'transparent', 'data-tip': `<b>${hora0}</b> · sin peticiones` }))
    if (c.rechazadas) partes.push(s('text', { x: x + ancho / 2, y: y(c.total) - 4, 'text-anchor': 'middle', fill: 'var(--critico-texto)', 'font-size': 12, 'font-weight': 700, 'aria-hidden': 'true' }, '✕'))
  })
  if (!maxReal) partes.push(s('text', { class: 'med', x: W / 2, y: H / 2 - 4 }, 'Aún no hay peticiones en los últimos 30 minutos'))
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Peticiones por minuto en los últimos 30 minutos. Máximo en un minuto: ${maxReal}.` }, partes)
  $('#g-minuto').replaceChildren(svg)

  const grupos = ORDEN.filter((g) => cubos.some((c) => c.grupos[g]) || g !== 'otro')
  $('#l-minuto').replaceChildren(...grupos.map((g) => h('span', {}, h('i', { class: 'punto', style: `background:${GRUPOS[g].color}` }), GRUPOS[g].nombre)),
    h('span', {}, h('b', { style: 'color:var(--critico-texto)' }, '✕'), 'con peticiones rechazadas'))
  const filas = cubos.filter((c) => c.total).reverse()
  $('#t-minuto-tabla').replaceChildren(filas.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Minuto'), ...ORDEN.map((g) => h('th', { class: 'n' }, GRUPOS[g].nombre)), h('th', { class: 'n' }, 'Rechazadas'), h('th', { class: 'n' }, 'Total'))),
    h('tbody', {}, filas.map((c) => h('tr', {}, h('td', {}, new Date(c.t0 * 1000).toLocaleTimeString('es-CO', { hour12: false, hour: '2-digit', minute: '2-digit' })),
      ...ORDEN.map((g) => h('td', { class: 'n' }, c.grupos[g] ?? 0)), h('td', { class: 'n' }, c.rechazadas), h('td', { class: 'n' }, c.total))))) : h('p', { class: 'vacio' }, 'Aún no hay peticiones en los últimos 30 minutos.'))
}

function graficaTiempos() {
  const W = 640, H = 250, L = 52, R = 10, T = 14, B = 34
  const t1 = ahora(), t0 = t1 - 1800
  const iw = W - L - R, ih = H - T - B
  const logMin = 1, logMax = 5                                      // 10 ms … 100 s
  const y = (ms) => T + ih - ((Math.log10(Math.min(Math.max(ms, 10), 1e5)) - logMin) / (logMax - logMin)) * ih
  const x = (t) => L + ((t - t0) / 1800) * iw
  const partes = []
  const marcas = [[10, '10 ms'], [100, '100 ms'], [1000, '1 s'], [10000, '10 s'], [100000, '100 s']]
  marcas.forEach(([v, t]) => partes.push(s('line', { class: v === 10 ? 'eje-g' : 'rejilla', x1: L, x2: W - R, y1: y(v), y2: y(v) }), s('text', { class: 'fin', x: L - 6, y: y(v) + 4 }, t)))
  ;[[0, 'hace 30 min'], [600, 'hace 20'], [1200, 'hace 10'], [1800, 'ahora']].forEach(([d, t]) => partes.push(s('text', { class: 'med', x: x(t0 + d), y: H - 12 }, t)))
  const fin = terminadas(E.eventos).filter((ev) => ev.t >= t0)
  for (const ev of fin) {
    const cx = x(ev.t), cy = y(ev.ms)
    const tipTxt = `<b>${esc(nombreRuta(ev.ruta))}</b><br>${hora(ev.t)} · ${duracion(ev.ms)}<br>${esc(frase(ev))}`
    if (ev.estado >= 400) partes.push(s('g', { 'data-tip': tipTxt }, s('circle', { cx, cy, r: 10, fill: 'transparent' }), s('path', { d: `M${cx - 4} ${cy - 4}l8 8M${cx + 4} ${cy - 4}l-8 8`, stroke: 'var(--critico)', 'stroke-width': 2.4, 'stroke-linecap': 'round' })))
    else partes.push(s('circle', { class: 'punto-g', cx, cy, r: 5, fill: GRUPOS[grupoDe(ev)].color, 'data-tip': tipTxt }))
  }
  if (!fin.length) partes.push(s('text', { class: 'med', x: W / 2, y: H / 2 - 4 }, 'Aún no hay peticiones en los últimos 30 minutos'))
  $('#g-tiempos').replaceChildren(s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Duración de las ${fin.length} peticiones de los últimos 30 minutos, en escala logarítmica.` }, partes))
  $('#l-tiempos').replaceChildren(...ORDEN.filter((g) => g !== 'otro').map((g) => h('span', {}, h('i', { class: 'punto', style: `background:${GRUPOS[g].color}` }), GRUPOS[g].nombre)),
    h('span', {}, h('b', { style: 'color:var(--critico-texto)' }, '✕'), 'rechazada'))
  const ult = fin.slice(-40).reverse()
  $('#t-tiempos-tabla').replaceChildren(ult.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Hora'), h('th', {}, 'Petición'), h('th', { class: 'n' }, 'Duración'), h('th', {}, 'Resultado'))),
    h('tbody', {}, ult.map((ev) => h('tr', {}, h('td', {}, hora(ev.t)), h('td', {}, nombreRuta(ev.ruta)), h('td', { class: 'n' }, duracion(ev.ms)), h('td', {}, ev.estado < 400 ? 'Atendida' : frase(ev)))))) : h('p', { class: 'vacio' }, 'Aún no hay peticiones en los últimos 30 minutos.'))
}

// ----------------------------------------------------------------------------- recursos y cupos

function sparkline(valores, max) {
  const W = 300, H = 22
  if (valores.length < 2) return s('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' })
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * W},${H - 2 - (Math.min(v, max) / max) * (H - 4)}`).join(' ')
  return s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, s('polyline', { points: pts, fill: 'none', stroke: 'var(--serie-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }))
}

function medida(etq, valor, max, cifra, { linea = null, avisoDesde = 0.7, llenoDesde = 0.95, pista = null } = {}) {
  const f = Math.max(0, Math.min(1, valor / max))
  return h('div', { class: 'medida', 'data-tip': pista }, h('span', { class: 'etq' }, etq),
    h('div', { class: 'pista', role: 'img', 'aria-label': `${etq}: ${cifra}` }, h('div', { class: `relleno ${f >= llenoDesde ? 'lleno' : f >= avisoDesde ? 'cerca' : ''}`, style: `width:${(f * 100).toFixed(1)}%` })),
    h('span', { class: 'cifra' }, cifra), linea ? h('div', { class: 'linea' }, linea) : null)
}

function pintarRecursos() {
  const sis = E.sistema
  const caja = $('#recursos')
  if (!sis) { caja.replaceChildren(h('p', { class: 'vacio' }, 'Consultando el equipo…')); return }
  const g = sis.gpu
  const gb = (mb) => (mb / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })
  const filas = []
  if (g) {
    filas.push(medida('Uso de la GPU', g.uso, 100, `${num(g.uso, 3)} %`, { linea: sparkline(E.historial.gpu, 100) }))
    filas.push(medida('Memoria de la GPU', g.vram_usada_mb, g.vram_total_mb, `${gb(g.vram_usada_mb)} de ${gb(g.vram_total_mb)} GB`, { linea: sparkline(E.historial.vram, g.vram_total_mb), avisoDesde: 0.95, llenoDesde: 0.99,
      pista: sis.ollama.modelos.length ? `${esc(sis.ollama.modelos[0].nombre)} ocupa ${gb(sis.ollama.modelos[0].vram_mb)} GB` : 'Ningún modelo de lenguaje cargado ahora' }))
    filas.push(medida('Temperatura', g.temp_c, 100, `${num(g.temp_c, 3)} °C`, { avisoDesde: 0.8, llenoDesde: 0.9 }))
    filas.push(medida('Potencia', g.potencia_w, g.potencia_max_w, `${num(g.potencia_w, 3)} de ${num(g.potencia_max_w, 3)} W`))
  } else filas.push(h('p', { class: 'sin-gpu' }, 'No se pudo leer la tarjeta gráfica (nvidia-smi no responde).'))
  filas.push(medida('Procesador', sis.pc.cpu, 100, `${num(sis.pc.cpu, 3)} %`, { linea: sparkline(E.historial.cpu, 100), avisoDesde: 0.85, llenoDesde: 0.98 }))
  filas.push(medida('Memoria del equipo', sis.pc.ram_usada_mb, sis.pc.ram_total_mb, `${gb(sis.pc.ram_usada_mb)} de ${gb(sis.pc.ram_total_mb)} GB`))
  const proc = [['Puerta de enlace', sis.puerta.proceso], ['Túnel', sis.tunel.proceso], ['Ollama', sis.ollama.proceso]].filter(([, p]) => p)
  if (proc.length) filas.push(h('p', { class: 'sin-gpu num' }, 'Memoria de cada pieza: ', proc.map(([n, p]) => `${n} ${entero(p.mem_mb)} MB`).join(' · ')))
  caja.replaceChildren(...filas)
}

const CUPOS = [['explicar', 'Asistente de texto'], ['stats', 'Estadística'], ['pendulo', 'Péndulo'], ['cp', 'CodePredict'], ['cp_limpio', 'Conjunto limpio']]

function pintarCupos() {
  const lim = E.sistema?.limites ?? { explicar: 10, stats: 120, pendulo: 240, cp: 60, cp_limpio: 10 }
  const uso = usoDeCupos(E.eventos, ahora())
  $('#cupos').replaceChildren(...CUPOS.map(([k, nombre]) => {
    const u = uso[k] ?? 0
    const lleno = u >= lim[k]
    return medida(nombre, u, lim[k], lleno ? `${u} de ${lim[k]} · ¡lleno!` : `${u} de ${lim[k]}`, { avisoDesde: 0.7, llenoDesde: 1, pista: `Se pueden hacer ${lim[k]} peticiones por minuto de este tipo` })
  }), h('p', { class: 'sin-gpu' }, 'Cuenta las peticiones del último minuto. Si un cupo se llena, la puerta de enlace responde «espera un minuto».'))
}

// ----------------------------------------------------------------------------- bitácora

const FILTROS = [['todo', 'Todo'], ['stats', 'Estadística'], ['pendulo', 'Péndulo'], ['cp', 'CodePredict'], ['explicar', 'Asistente de texto'], ['rechazos', 'Rechazadas']]

function pintarFiltros() {
  $('#filtros').replaceChildren(...FILTROS.map(([k, t]) => h('button', { class: 'boton', type: 'button', 'aria-pressed': String(E.filtro === k), onclick: () => { E.filtro = k; pintarFiltros(); pintarBitacora() } }, t)))
}

function detalleDe(ev) {
  const d = ev.d ?? {}
  const partes = []
  if (d.pasos?.length) partes.push(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Paso'), h('th', { class: 'n' }, 'Filas antes'), h('th', { class: 'n' }, 'Después'), h('th', {}, 'Dos vías'))),
    h('tbody', {}, d.pasos.map((p) => h('tr', {}, h('td', {}, p.titulo ?? p.id), h('td', { class: 'n' }, entero(p.antes)), h('td', { class: 'n' }, entero(p.despues)), h('td', {}, p.verificado === true ? 'coinciden ✓' : p.verificado === false ? '¡NO coinciden!' : 'sin comprobar'))))))
  if (d.pruebas?.length) partes.push(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Prueba'), h('th', { class: 'n' }, 'Estadístico'), h('th', {}, 'Dos vías'))),
    h('tbody', {}, d.pruebas.map((p) => h('tr', {}, h('td', {}, p.nombre), h('td', { class: 'n' }, num(p.estadistico)), h('td', {}, p.verificado ? 'coinciden ✓' : '¡NO coinciden!'))))))
  if (d.vias?.length) partes.push(h('div', {}, h('b', {}, 'Vías de verificación: '), d.vias.join(' · ')))
  partes.push(h('div', {}, `Duración ${duracion(ev.ms)} · entró ${entero(ev.bytes_in)} bytes · salió ${entero(ev.bytes_out)} bytes · ${ev.origen === 'tunel' ? 'llegó por el túnel' : 'vino de este PC'} · código ${ev.cliente}`))
  return partes
}

function pintarBitacora() {
  const lista = terminadas(E.eventos).filter((ev) => E.filtro === 'todo' || (E.filtro === 'rechazos' ? ev.estado >= 400 : grupoDe(ev) === E.filtro)).slice(-120).reverse()
  const caja = $('#bitacora')
  if (!lista.length) { caja.replaceChildren(h('li', { class: 'vacio' }, h('strong', {}, 'No hay nada que mostrar con este filtro.'), 'Prueba con «Todo».')); return }
  caja.replaceChildren(...lista.map((ev) => {
    const abierta = E.abiertas.has(ev.id)
    const mal = ev.estado >= 400
    return h('li', { class: `entrada ${mal ? 'rechazo' : ''}` },
      h('button', { type: 'button', 'aria-expanded': String(abierta), onclick: () => { abierta ? E.abiertas.delete(ev.id) : E.abiertas.add(ev.id); pintarBitacora() } },
        h('span', { class: 'hora' }, hora(ev.t)),
        h('span', { class: 'texto' }, h('b', {}, nombreRuta(ev.ruta)), h('span', {}, `${frase(ev)} · ${persona(ev.cliente)}`)),
        h('span', { class: 'ms' }, h('span', { class: `chip-estado ${mal ? 'estado-mal' : 'estado-ok'}` }, icono(mal ? 'mal' : 'ok', 14), mal ? `Error ${ev.estado}` : 'Atendida'), ' · ', duracion(ev.ms))),
      abierta ? h('div', { class: 'mas' }, detalleDe(ev)) : null)
  }))
}

// ----------------------------------------------------------------------------- conexión con el servidor del panel

function conexion(estado, texto) {
  const c = $('#conexion')
  c.className = `vivo ${estado}`
  c.lastElementChild.textContent = texto
}

let fuente = null
let reintento = null

async function conectar() {
  clearTimeout(reintento)
  fuente?.close()
  try {
    const r = await fetch('/api/eventos?ultimos=800', { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    E.eventos = d.eventos
    const es = await fetch('/api/estado', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (es) { E.sistema = es; apuntar(es) }
    for (const f of fichas.values()) f.g.remove()
    fichas.clear()
    enVuelo(E.eventos, ahora()).forEach((ev) => alLlegar(ev, true))
    pintarTodo()
    fuente = new EventSource(`/api/flujo?desde=${d.posicion}`)
    fuente.onopen = () => conexion('ok', 'En vivo')
    fuente.onerror = () => { conexion('espera', 'Reconectando…'); fuente.close(); reintento = setTimeout(conectar, 2000) }
    fuente.addEventListener('estado', (m) => { E.sistema = JSON.parse(m.data); apuntar(E.sistema); pintarPiezas(); pintarRecursos(); pintarCupos() })
    fuente.addEventListener('evento', (m) => alEvento(JSON.parse(m.data)))
  } catch {
    conexion('mal', 'Sin conexión con el panel')
    reintento = setTimeout(conectar, 3000)
  }
}

function apuntar(sis) {
  const push = (a, v) => { if (v != null) { a.push(v); if (a.length > 90) a.shift() } }
  push(E.historial.gpu, sis.gpu?.uso); push(E.historial.vram, sis.gpu?.vram_usada_mb); push(E.historial.cpu, sis.pc?.cpu)
}

function alEvento(ev) {
  E.eventos.push(ev)
  if (E.eventos.length > MAX_EVENTOS) E.eventos.splice(0, E.eventos.length - MAX_EVENTOS)
  if (ev.e === 'arranque') { for (const f of fichas.values()) f.g.remove(); fichas.clear() }
  else if (ev.e === 'inicio') alLlegar(ev)
  else if (ev.e === 'fin') alTerminar(ev)
  pintarContadores(); pintarAhora(); pintarVerificado(); graficaMinuto(); graficaTiempos(); pintarCupos(); pintarBitacora()
}

function pintarTodo() {
  pintarPiezas(); pintarContadores(); pintarAhora(); pintarVerificado(); graficaMinuto(); graficaTiempos(); pintarRecursos(); pintarCupos(); pintarFiltros(); pintarBitacora()
}

// ----------------------------------------------------------------------------- relojes: números que avanzan solos entre eventos

setInterval(() => {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = duracion((ahora() - Number(el.dataset.t)) * 1000)
  for (const f of fichas.values()) {
    const t = $('text', f.g)
    if (t && f.ev && f.ev.e === 'inicio') t.textContent = duracion((ahora() - f.ev.t) * 1000)
  }
}, 100)

setInterval(() => { pintarPiezas(); pintarAhora(); graficaMinuto(); graficaTiempos(); pintarCupos(); pintarContadores() }, 5000)

// ----------------------------------------------------------------------------- tema y vista de tabla

const raiz = document.documentElement
function aplicarTema(t) {
  if (t) raiz.dataset.theme = t
  const oscuro = (raiz.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
  $('#tema').textContent = oscuro ? 'Tema claro' : 'Tema oscuro'
}
try { const g = localStorage.getItem('ada-panel-tema'); if (g === 'dark' || g === 'light') raiz.dataset.theme = g } catch { /* sin almacenamiento */ }
aplicarTema()
$('#tema').addEventListener('click', () => {
  const oscuro = (raiz.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
  const nuevo = oscuro ? 'light' : 'dark'
  aplicarTema(nuevo)
  try { localStorage.setItem('ada-panel-tema', nuevo) } catch { /* sin almacenamiento */ }
})
$('#ver-tabla').addEventListener('change', (e) => { E.tabla = e.target.checked; document.body.classList.toggle('como-tabla', E.tabla) })

construirRecorrido()
pintarPiezas()
conectar()
