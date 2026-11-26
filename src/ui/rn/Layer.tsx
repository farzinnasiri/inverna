import type { ReactNode } from 'react'
import { Modal, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay } from 'react-native-screens'
import { NightFilterOverlay } from './NightFilterOverlay'

/**
 * Overlay container (Al Dente pattern):
 * - On iOS: react-native-screens FullWindowOverlay avoids native Modal stacking freezes.
 * - On Android & Web: transparent Modal portal.
 *
 * Mounts the night filter's dimming on top of the portal content, so sheets
 * dim with the rest of the app (the warm layer stays in the main window).
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

  const content = (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
        {children}
        <NightFilterOverlay dimOnly />
      </View>
    </GestureHandlerRootView>
  )

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>
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
      {content}
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
