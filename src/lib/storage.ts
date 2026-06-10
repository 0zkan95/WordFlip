/**
 * src/lib/storage.ts
 *
 * Platform-aware key-value storage:
 *  - Web:    localStorage (synchronous browser API, no OPFS conflicts)
 *  - Native: expo-sqlite/kv-store
 *
 * Both satisfy Supabase's SupportedStorage interface.
 */

import { Platform } from 'react-native'

interface KVStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

const webStorage: KVStorage = {
  getItem:    (key) => Promise.resolve(localStorage.getItem(key)),
  setItem:    (key, value) => { localStorage.setItem(key, value); return Promise.resolve() },
  removeItem: (key) => { localStorage.removeItem(key); return Promise.resolve() },
}

// Lazy-load expo-sqlite/kv-store on native only to avoid OPFS conflicts on web
let _nativeStorage: KVStorage | null = null
function getNativeStorage(): KVStorage {
  if (!_nativeStorage) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _nativeStorage = require('expo-sqlite/kv-store').default as KVStorage
  }
  return _nativeStorage
}

export const appStorage: KVStorage =
  Platform.OS === 'web' ? webStorage : getNativeStorage()
