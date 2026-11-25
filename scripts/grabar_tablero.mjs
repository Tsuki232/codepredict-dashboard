#!/usr/bin/env node
/*
 * Graba el modo presentación del tablero a un vídeo MP4, fotograma a fotograma y SIN instalar nada:
 * usa Edge (en segundo plano), el protocolo de depuración de Chromium (el WebSocket que ya trae Node 22) y ffmpeg.
 *
 * Como cada gráfica es una función del tiempo de su escena, el programa pone el reloj de la película en el instante exacto de
 * cada fotograma (`window.__pelicula.buscar(ms)`) y fotografía la pantalla: el vídeo sale idéntico en cada grabación, sin saltos
 * ni cuadros perdidos aunque el equipo tarde en dibujar.
 *
 * Requisitos: el panel corriendo (por defecto en http://127.0.0.1:8000), con la limpieza guardada.
 *
 *   node scripts/grabar_tablero.mjs --salida CodePredict_Tablero.mp4
 *   node scripts/grabar_tablero.mjs --salida prueba --prueba 12        # solo 12 fotos sueltas (JPEG) en la carpeta «prueba», para revisar
 *
 * Opciones: --ancho 1920 --alto 1080 --fps 30 --calidad 92 --final 1.5 (segundos que se queda la última escena)
 *           --url http://127.0.0.1:8000 --edge <msedge.exe> --ffmpeg <ffmpeg.exe> --puerto 9333
 *           --sin-gpu   dibuja con el procesador en vez de la tarjeta gráfica (más lento, pero no la exige)
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const arg = (nombre, defecto) => { const i = process.argv.indexOf(`--${nombre}`); return i > -1 ? process.argv[i + 1] : defecto }
const SALIDA = arg('salida')
if (!SALIDA) { console.error('Falta --salida (ruta del .mp4, o de una carpeta con --prueba).'); process.exit(2) }
const ANCHO = Number(arg('ancho', 1920))
const ALTO = Number(arg('alto', 1080))
const FPS = Number(arg('fps', 30))
const CALIDAD = Number(arg('calidad', 92))
const FINAL_S = Number(arg('final', 1.5))
const PRUEBA = Number(arg('prueba', 0))
const PUERTO = Number(arg('puerto', 9333))
const URL_BASE = arg('url', 'http://127.0.0.1:8000')
const EDGE = arg('edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
const FFMPEG = arg('ffmpeg', 'ffmpeg')
const SIN_GPU = process.argv.includes('--sin-gpu')            // dibuja con el procesador y no con la tarjeta gráfica: más lento, pero no la exige

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toLocaleTimeString('es-CO'), ...a)

async function esperarHasta(condicion, { cada = 250, limite = 60_000, que = 'la condición' } = {}) {
  const t0 = Date.now()
  for (;;) {
    try { const v = await condicion(); if (v) return v } catch { /* todavía no */ }
    if (Date.now() - t0 > limite) throw new Error(`Se agotó el tiempo esperando ${que}.`)
    await pausa(cada)
  }
}

/** Un cliente mínimo del protocolo de depuración (CDP) sobre el WebSocket de Node. */
class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pendientes = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      const p = m.id !== undefined ? this.pendientes.get(m.id) : null
      if (!p) return
      this.pendientes.delete(m.id)
      if (m.error) p.rechaza(new Error(`${p.metodo}: ${m.error.message}`)); else p.resuelve(m.result)
    })
  }
  enviar(metodo, params = {}) {
    const id = ++this.id
    return new Promise((resuelve, rechaza) => { this.pendientes.set(id, { resuelve, rechaza, metodo }); this.ws.send(JSON.stringify({ id, method: metodo, params })) })
  }
  async evaluar(expresion, esperarPromesa = false) {
    const r = await this.enviar('Runtime.evaluate', { expression: expresion, awaitPromise: esperarPromesa, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`Error en la página: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }
}

async function main() {
  const perfil = mkdtempSync(join(tmpdir(), 'grabar-tablero-'))                // perfil de Edge desechable: no toca el tuyo
  let edge = null
  let ff = null
  const limpiar = () => {
    try { if (edge?.pid) spawn('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ya cerró */ }
    try { ff?.kill() } catch { /* ya cerró */ }
    setTimeout(() => { try { rmSync(perfil, { recursive: true, force: true }) } catch { /* Windows aún lo usa: queda en la carpeta temporal */ } }, 1500)
  }
  process.on('SIGINT', () => { limpiar(); process.exit(130) })

  try {
    log(`Abriendo Edge en segundo plano (${ANCHO}×${ALTO}) …`)
    edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, `--window-size=${ANCHO},${ALTO}`,
      '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      ...(SIN_GPU ? ['--disable-gpu'] : []), 'about:blank'], { stdio: 'ignore' })
    const objetivo = await esperarHasta(async () => {
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()
      return lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    }, { que: 'que Edge responda' })
    const ws = new WebSocket(objetivo.webSocketDebuggerUrl)
    await once(ws, 'open')
    const cdp = new Cdp(ws)

    await cdp.enviar('Page.enable')
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false })
    log('Abriendo el tablero …')
    await cdp.enviar('Page.navigate', { url: `${URL_BASE}/?captura=1#/tablero` })
    await esperarHasta(() => cdp.evaluar(`!!window.__tableroListo && !!document.querySelector('.presentacion') && window.__pelicula?.activo === true`),
      { limite: 120_000, que: 'que el tablero esté listo (¿está corriendo el panel y guardada la limpieza?)' })
    await cdp.evaluar('document.fonts.ready.then(() => true)', true)

    const total = await cdp.evaluar('window.__pelicula.total')
    const escenas = await cdp.evaluar('window.__pelicula.escenas.length')
    const instantes = PRUEBA > 0
      ? Array.from({ length: PRUEBA }, (_, j) => Math.min(total, (total * (j + 0.5)) / PRUEBA))
      : Array.from({ length: Math.round((total / 1000 + FINAL_S) * FPS) }, (_, f) => Math.min(total, (f * 1000) / FPS))
    log(`${escenas} escenas, ${(total / 1000).toFixed(1)} s de película → ${instantes.length} fotogramas`)

    if (PRUEBA > 0) mkdirSync(SALIDA, { recursive: true })
    else {
      mkdirSync(dirname(SALIDA) || '.', { recursive: true })
      ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        // Las fotos JPEG son de rango completo: se pasan al rango de vídeo estándar (yuv420p) para que se vea igual en PowerPoint, el móvil y los navegadores.
        '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-color_range', 'tv', '-movflags', '+faststart', SALIDA], { stdio: ['pipe', 'inherit', 'inherit'] })
      ff.on('error', (e) => { console.error(`No se pudo ejecutar ffmpeg (${FFMPEG}): ${e.message}`); process.exit(1) })
    }

    const t0 = Date.now()
    for (let f = 0; f < instantes.length; f++) {
      await cdp.evaluar(`window.__pelicula.buscar(${instantes[f]})`)
      await cdp.evaluar('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', true)     // dos cuadros: React ya pintó
      const foto = await cdp.enviar('Page.captureScreenshot', { format: 'jpeg', quality: CALIDAD, optimizeForSpeed: true })
      const buf = Buffer.from(foto.data, 'base64')
      if (PRUEBA > 0) writeFileSync(join(SALIDA, `cuadro_${String(f + 1).padStart(2, '0')}_${Math.round(instantes[f] / 100) / 10}s.jpg`), buf)
      else if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain')
      if ((f + 1) % 60 === 0 || f === instantes.length - 1) {
        const seg = (Date.now() - t0) / 1000
        log(`fotograma ${f + 1}/${instantes.length} (${(((f + 1) / instantes.length) * 100).toFixed(0)} %) · van ${seg.toFixed(0)} s · faltan ≈ ${((seg / (f + 1)) * (instantes.length - f - 1)).toFixed(0)} s`)
      }
    }

    if (ff) {
      ff.stdin.end()
      const [codigo] = await once(ff, 'close')
      if (codigo !== 0) throw new Error(`ffmpeg terminó con el código ${codigo}.`)
    }
    ws.close()
    log(PRUEBA > 0 ? `Listo: ${instantes.length} fotos en ${SALIDA}` : `Listo: ${SALIDA}`)
  } finally {
    limpiar()
  }
}

main().then(() => setTimeout(() => process.exit(0), 2000)).catch((e) => { console.error(`\nError: ${e.message}`); setTimeout(() => process.exit(1), 2000) })
