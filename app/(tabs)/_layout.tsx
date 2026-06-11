/**
 * app/(tabs)/_layout.tsx  — Tab navigator
 *
 * Four tabs: Home, Study, Stats, Profile
 * Dark background, violet-purple active tint.
 */

import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../src/theme/colors'

type IconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({
  name,
  focused,
}: {
  name: IconName
  focused: boolean
}) {
  return (
    <Ionicons
      name={name}
      size={24}
      color={focused ? Colors.tab.active : Colors.tab.inactive}
    />
  )
}

export default function TabLayout() {
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bg.base,
          borderTopColor: Colors.tab.border,
          borderTopWidth: 0.5,
          // Add the system nav-bar inset so the tab bar clears the on-screen
          // back/home/recents buttons (or gesture pill) on Android.
          paddingBottom: Platform.OS === 'ios' ? 20 : 8 + insets.bottom,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 80 : 60 + insets.bottom,
        },
        tabBarActiveTintColor:   Colors.tab.active,
        tabBarInactiveTintColor: Colors.tab.inactive,
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'layers' : 'layers-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'bar-chart' : 'bar-chart-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}