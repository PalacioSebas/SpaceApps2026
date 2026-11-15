'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type ExplorerLevel = 'curioso' | 'aficionado' | 'investigador'

const STORAGE_KEY = 'papastronomy:explorer-level'
const DEFAULT_LEVEL: ExplorerLevel = 'curioso'
const listeners = new Set<() => void>()

function isLevel(value: unknown): value is ExplorerLevel {
  return value === 'curioso' || value === 'aficionado' || value === 'investigador'
}

function read(): ExplorerLevel {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLevel(stored) ? stored : DEFAULT_LEVEL
  } catch {
    return DEFAULT_LEVEL
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useExplorerLevel() {
  const level = useSyncExternalStore(subscribe, read, () => DEFAULT_LEVEL)

  const setLevel = useCallback((next: ExplorerLevel) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage may be unavailable (private mode); the in-memory notify still updates the UI.
    }
    listeners.forEach((listener) => listener())
  }, [])

  return [level, setLevel] as const
}
