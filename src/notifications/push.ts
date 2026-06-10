/**
 * src/notifications/push.ts
 * Thin wrapper around expo-notifications for local (immediate) notifications.
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// Show alerts in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge:  false,
    shouldShowBanner: true,
    shouldShowList:  true,
  }),
})

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return true
    const { status } = await Notifications.requestPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,  // fire immediately
    })
  } catch (e) {
    console.warn('[push] sendLocalNotification failed:', e)
  }
}
