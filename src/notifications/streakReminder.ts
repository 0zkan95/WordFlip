/**
 * src/notifications/streakReminder.ts
 *
 * Schedules a single daily "don't break your streak" reminder.
 *
 * Strategy:
 *  - Call scheduleStreakReminder(profile) whenever the app loads or the
 *    user returns to the home screen.
 *  - If user has already met the daily minimum today → remind tomorrow.
 *  - If user hasn't studied today → remind later today at REMINDER_HOUR.
 *    If it's already past REMINDER_HOUR → remind tomorrow.
 *  - No streak? Still reminds, but with a softer "start studying" message.
 *
 * Uses a fixed identifier so re-scheduling always replaces the old one.
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { UserProfile } from '../db/schema'
import { STREAK_DAILY_MINIMUM } from '../db/schema'

const REMINDER_ID   = 'wordflip-streak-reminder'
const REMINDER_HOUR = 20  // 8 PM local time

function todayAt(hour: number): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d
}

function tomorrowAt(hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

export async function scheduleStreakReminder(profile: UserProfile): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    // Always cancel the existing reminder first so we never double-schedule
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {})

    const todayStr    = new Date().toISOString().slice(0, 10)
    const studiedToday = profile.lastStudyDate === todayStr
      && (profile.dailyReviewsCount ?? 0) >= STREAK_DAILY_MINIMUM

    const streak = profile.currentStreak

    let fireAt: Date
    let title:  string
    let body:   string

    if (studiedToday) {
      // User is done for today — remind them tomorrow
      fireAt = tomorrowAt(REMINDER_HOUR)
      title  = streak > 0
        ? `🔥 Keep your ${streak}-day streak going!`
        : '📚 Daily study reminder'
      body   = streak > 0
        ? `You're on a ${streak}-day streak. Don't forget to study tomorrow!`
        : 'Review your flashcards tomorrow to build a daily habit.'
    } else {
      // User hasn't studied today yet
      const targetToday = todayAt(REMINDER_HOUR)
      fireAt = new Date() >= targetToday ? tomorrowAt(REMINDER_HOUR) : targetToday

      title  = streak > 0
        ? `🔥 Don't break your ${streak}-day streak!`
        : '📚 Time to study!'
      body   = streak > 0
        ? "You haven't studied today yet. Keep your streak alive!"
        : 'Open WordFlip and review some cards to start your streak.'
    }

    const secondsUntilFire = Math.floor((fireAt.getTime() - Date.now()) / 1000)
    if (secondsUntilFire <= 0) return  // edge case: target already in the past

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content:    { title, body, sound: true },
      trigger:    { seconds: secondsUntilFire },
    })
  } catch (e) {
    console.warn('[streakReminder] schedule failed:', e)
  }
}

export async function cancelStreakReminder(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID)
  } catch {
    // Ignore — notification may not exist
  }
}
