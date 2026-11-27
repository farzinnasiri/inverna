import { createContext, useContext, type ReactNode } from 'react'
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context'

/**
 * The device's own safe-area insets: the notch or Dynamic Island on top, the
 * home indicator below.
 *
 * Inside a native tab, `useSafeAreaInsets` answers differently. Expo Router
 * wraps each tab in its own SafeAreaProvider, and iOS counts the tab bar in a
 * tab's bottom inset (34 becomes 83 on most iPhones). That arrives a moment
 * after the first frame, so the tabs laid out right and then shrank. Our tabs
 * already leave room for the floating bar themselves (`tabBarClearance`), so
 * they want the device's insets, read once at the root.
 */
const DeviceInsetsContext = createContext<EdgeInsets | null>(null)

/** Goes just inside the root SafeAreaProvider, outside any navigator. */
export function DeviceInsetsProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return <DeviceInsetsContext.Provider value={insets}>{children}</DeviceInsetsContext.Provider>
}

/** The device's insets; the nearest provider's when there's no root one (tests, previews). */
export function useDeviceInsets(): EdgeInsets {
  const nearest = useSafeAreaInsets()
  return useContext(DeviceInsetsContext) ?? nearest
}
