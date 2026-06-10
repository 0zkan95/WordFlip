/**
 * DatabaseContext
 *
 * Opens the SQLite database once at startup, runs migrations,
 * and provides the `db` instance to the whole app via context.
 *
 * Usage
 * ─────
 *  // Wrap your root layout:
 *  <DatabaseProvider><Slot /></DatabaseProvider>
 *
 *  // In any screen or hook:
 *  const { db } = useDatabase()
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import * as SQLite from 'expo-sqlite'
import { getDatabase, runMigrations } from '../db/schema'
import { Colors } from '../theme/colors'

// ─── Context ──────────────────────────────────────────────────────────────────

interface DatabaseContextValue {
  db: SQLite.SQLiteDatabase
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb]       = useState<SQLite.SQLiteDatabase | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDatabase()
      .then(async (database) => {
        await runMigrations(database)
        setDb(database)
      })
      .catch((e) => {
        console.error('[DB] Failed to initialise:', e)
        setError(String(e))
      })
  }, [])

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Database error:{'\n'}{error}</Text>
      </View>
    )
  }

  if (!db) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.accent.default} size="large" />
      </View>
    )
  }

  return (
    <DatabaseContext.Provider value={{ db }}>
      {children}
    </DatabaseContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within <DatabaseProvider>')
  return ctx
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: Colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: Colors.semantic.error,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
})