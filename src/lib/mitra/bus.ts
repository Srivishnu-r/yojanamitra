/**
 * Mitra action bus.
 *
 * A tiny, dependency-free pub/sub channel that lets any part of the app (or the
 * agent's tool events) ask the on-screen companion to do something: say a line,
 * perform a gesture, or reach over and point at / click a real UI element.
 *
 * Usage from anywhere in the client:
 *
 *   mitra.say('Namaste! I can help you find schemes.')
 *   mitra.pointAt('[data-mitra="digilocker-connect"]', { click: true })
 *
 * The companion is the only subscriber, so this stays a one-way channel.
 * `window.mitra` is exposed for quick manual demos from the browser console.
 */

export type MitraGesture =
  | 'idle'
  | 'namaste'
  | 'wave'
  | 'point'
  | 'think'
  | 'celebrate'

export interface SayCommand {
  kind: 'say'
  text: string
  /** Read the line out loud through Sarvam TTS when available. */
  speak?: boolean
  /** Pose to strike while speaking. */
  gesture?: MitraGesture
  /** Auto-hide the bubble after this many ms (0 keeps it until replaced). */
  ttl?: number
}

export interface GestureCommand {
  kind: 'gesture'
  gesture: MitraGesture
  /** How long to hold the pose before returning to idle (ms). */
  hold?: number
}

export interface PointCommand {
  kind: 'point'
  /** CSS selector for the element to point at. */
  target: string
  /** Click the element once the hand arrives. */
  click?: boolean
  /** Optional line to show while pointing. */
  text?: string
}

export interface OpenCommand {
  kind: 'open'
}

export interface CloseCommand {
  kind: 'close'
}

export type MitraCommand =
  | SayCommand
  | GestureCommand
  | PointCommand
  | OpenCommand
  | CloseCommand

type Listener = (command: MitraCommand) => void

const listeners = new Set<Listener>()

export function onMitraCommand(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitMitraCommand(command: MitraCommand): void {
  for (const listener of listeners) listener(command)
}

export const mitra = {
  say(text: string, options: Omit<SayCommand, 'kind' | 'text'> = {}): void {
    emitMitraCommand({ kind: 'say', text, ...options })
  },

  gesture(gesture: MitraGesture, hold?: number): void {
    emitMitraCommand({ kind: 'gesture', gesture, hold })
  },

  namaste(): void {
    emitMitraCommand({ kind: 'gesture', gesture: 'namaste', hold: 2600 })
  },

  wave(): void {
    emitMitraCommand({ kind: 'gesture', gesture: 'wave', hold: 1800 })
  },

  think(): void {
    emitMitraCommand({ kind: 'gesture', gesture: 'think', hold: 1400 })
  },

  celebrate(): void {
    emitMitraCommand({ kind: 'gesture', gesture: 'celebrate', hold: 2200 })
  },

  pointAt(target: string, options: Omit<PointCommand, 'kind' | 'target'> = {}): void {
    emitMitraCommand({ kind: 'point', target, ...options })
  },

  open(): void {
    emitMitraCommand({ kind: 'open' })
  },

  close(): void {
    emitMitraCommand({ kind: 'close' })
  },
}

export type Mitra = typeof mitra
