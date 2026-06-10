/**
 * app/notifications/index.tsx — Notification center
 */

import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView,
  FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { useDatabase } from '../../src/context/DatabaseContext'
import { getNotifications, markAllNotificationsRead } from '../../src/db/queries'
import type { AppNotification } from '../../src/db/schema'
import { Colors } from '../../src/theme/colors'

// ─── Icon + accent per notification type ─────────────────────────────────────

const TYPE_CONFIG: Record<AppNotification['type'], {
  icon: React.ComponentProps<typeof Ionicons>['name']
  accent: string
  bg: string
}> = {
  level_up: {
    icon:   'trophy-outline',
    accent: Colors.accent.default,
    bg:     Colors.accent.dim,
  },
  streak_milestone: {
    icon:   'flame-outline',
    accent: Colors.streak.text,
    bg:     Colors.streak.bg,
  },
  xp_milestone: {
    icon:   'star-outline',
    accent: Colors.semantic.warning,
    bg:     Colors.semantic.warningDim,
  },
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diffMs  = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)   return 'just now'
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)   return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7)   return `${diffDay}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({ item }: { item: AppNotification }) {
  const cfg = TYPE_CONFIG[item.type]
  return (
    <View style={[n.row, !item.isRead && n.rowUnread]}>
      <View style={[n.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={n.title}>{item.title}</Text>
        <Text style={n.body}>{item.body}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={n.time}>{relativeTime(item.createdAt)}</Text>
        {!item.isRead && <View style={n.dot} />}
      </View>
    </View>
  )
}

const n = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.bg.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border.default,
    padding: 14, marginBottom: 8,
  },
  rowUnread: { borderColor: 'rgba(167,139,250,0.25)' },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 14, fontWeight: '500', color: Colors.text.primary, marginBottom: 3 },
  body:     { fontSize: 13, color: Colors.text.secondary, lineHeight: 18 },
  time:     { fontSize: 11, color: Colors.text.faint },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.accent.default, marginTop: 6,
  },
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { db } = useDatabase()
  const router  = useRouter()

  const [items,   setItems]   = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getNotifications(db)
      .then(setItems)
      .finally(() => setLoading(false))

    // Mark all as read when the screen opens
    markAllNotificationsRead(db).catch(() => {})
  }, [db])

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.accent.default} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.text.faint} />
          <Text style={s.emptyTitle}>No notifications yet</Text>
          <Text style={s.emptyDesc}>
            You'll be notified when you level up, hit a streak milestone, or reach an XP goal.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <NotificationRow item={item} />}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border.subtle,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.bg.surface,
    borderWidth: 0.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '500', color: Colors.text.primary },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: Colors.text.primary, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: Colors.text.muted, textAlign: 'center', lineHeight: 22 },
})
