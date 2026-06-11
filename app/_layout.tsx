/**
 * app/_layout.tsx  — Root layout
 */

import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { DatabaseProvider } from '../src/context/DatabaseContext'
import { AuthProvider } from '../src/context/AuthContext'
import { requestNotificationPermissions } from '../src/notifications/push'

export default function RootLayout() {
  useEffect(() => {
    requestNotificationPermissions()
  }, [])

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="transparent" translucent />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  )
}
