import type { ReactNode } from 'react'
import { Modal, Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay } from 'react-native-screens'

/**
 * Overlay container (Al Dente pattern):
 * - On iOS: react-native-screens FullWindowOverlay avoids native Modal stacking freezes.
 * - On Android & Web: transparent Modal portal.
 */
export function Layer({
  visible,
  onRequestClose,
  label,
  children,
}: {
  visible: boolean
  onRequestClose: () => void
  label?: string
  children: ReactNode
}) {
  if (!visible) return null

  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
      </FullWindowOverlay>
    )
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose}
      accessibilityLabel={label}
    >
      <GestureHandlerRootView style={styles.root}>{children}</GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
