/**
 * Manual mock for @expo/vector-icons — the real package eagerly loads every
 * icon set via expo-font, which pulls in expo-asset (not installed and not
 * needed for tests). Stub every icon set with a plain View.
 */

const React = require('react')
const { View } = require('react-native')

function createIconComponent(setName) {
  return function MockIcon({ name, size, color, style, ...rest }) {
    return React.createElement(View, {
      ...rest,
      style,
      testID: rest.testID ?? `icon-${setName}-${name}`,
    })
  }
}

module.exports = new Proxy({}, {
  get: (_target, iconSetName) => createIconComponent(String(iconSetName)),
})
