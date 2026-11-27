import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Check } from 'lucide-react-native'
import { presetById } from '@/core/sound/catalog'
import { feel } from '@/ui/feel'
import { paywall as copy } from '@/ui/copy'
import { PRIVACY_URL } from '@/ui/links'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useSettings } from '@/ui/state/settings'
import { useUnlock } from '@/ui/state/unlock'
import { AmbientBackdrop } from './AmbientBackdrop'
import { Button } from './controls'
import { GlassSurface } from './Glass'
import { useResponsiveLayout } from './hooks'

/** Apple's standard licence agreement, which Inverna uses as its terms. */
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'

/**
 * The one purchase, right after onboarding: what's ready for tonight, the
 * price from the App Store, and the way back in for someone who already
 * bought it. The scene keeps moving behind it.
 */
export function Paywall() {
  const { color } = useTokenColors()
  const { insets, sideMargin, frameWidth } = useResponsiveLayout()
  const status = useUnlock((s) => s.status)
  const price = useUnlock((s) => s.price)
  const unreachable = useUnlock((s) => s.unreachable)
  const sessionMinutes = useSettings((s) => s.sessionMinutes)
  const sessionPreset = useSettings((s) => s.sessionPreset)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void useUnlock.getState().check()
  }, [])
  useEffect(() => {
    if (status === 'unlocked') router.replace('/')
  }, [status])

  const sound = presetById(sessionPreset ?? '')?.name ?? 'Your sound'
  const ready = [copy.windDown(sessionMinutes), copy.sounds(sound), copy.games, copy.nothing]

  const buy = async () => {
    if (busy) return
    feel('commit')
    setBusy('buy')
    setNote(null)
    const res = await useUnlock.getState().buy()
    setBusy(null)
    if (res === 'pending') setNote(copy.pending)
    else if (res === 'failed') setNote(useUnlock.getState().unreachable ? copy.unreachable : copy.failed)
  }

  const restore = async () => {
    if (busy) return
    setBusy('restore')
    setNote(null)
    const owned = await useUnlock.getState().restore()
    setBusy(null)
    if (owned === null) setNote(copy.unreachable)
    else if (!owned) setNote(copy.nothingToRestore)
  }

  return (
    <View style={styles.root}>
      <AmbientBackdrop />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 36, paddingBottom: Math.max(insets.bottom, 16) + 12, paddingHorizontal: sideMargin },
        ]}
      >
        <View style={[styles.column, { maxWidth: frameWidth }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: color.ink }]}>
            {copy.title}
          </Text>
          <Text style={[styles.body, { color: color.ink2 }]}>{copy.body}</Text>

          <GlassSurface variant="card" radius={22} style={styles.card}>
            <Text style={[styles.kicker, { color: color.accent }]}>{copy.readyTitle}</Text>
            {ready.map((line) => (
              <View key={line} style={styles.row}>
                <Check size={16} strokeWidth={2} color={color.accent} />
                <Text style={[styles.rowText, { color: color.ink }]}>{line}</Text>
              </View>
            ))}
          </GlassSurface>

          <Text style={[styles.trust, { color: color.ink2 }]}>{price ? copy.trust(price) : copy.trustNoPrice}</Text>

          <Button variant="primary" block onPress={() => void buy()}>
            {busy === 'buy' ? <ActivityIndicator color={color.accent} /> : copy.cta(price)}
          </Button>
          {note || (unreachable && !price) ? (
            <Text accessibilityLiveRegion="polite" style={[styles.note, { color: color.ink2 }]}>
              {note ?? copy.unreachable}
            </Text>
          ) : null}

          <View style={styles.links}>
            <Pressable accessibilityRole="button" onPress={() => void restore()} hitSlop={8}>
              <Text style={[styles.link, { color: color.ink2 }]}>{busy === 'restore' ? '…' : copy.restore}</Text>
            </Pressable>
            <Text style={[styles.dot, { color: color.ink3 }]}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8}>
              <Text style={[styles.link, { color: color.ink2 }]}>{copy.privacy}</Text>
            </Pressable>
            <Text style={[styles.dot, { color: color.ink3 }]}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)} hitSlop={8}>
              <Text style={[styles.link, { color: color.ink2 }]}>{copy.terms}</Text>
            </Pressable>
          </View>
          <Text style={[styles.small, { color: color.ink3 }]}>{copy.small}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', gap: 14 },
  title: { fontSize: 32, fontWeight: '600', letterSpacing: -0.7, lineHeight: 38 },
  body: { fontSize: 17, lineHeight: 24 },
  card: { paddingHorizontal: 18, paddingVertical: 16, gap: 12, marginTop: 6 },
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowText: { flex: 1, fontSize: 15.5, lineHeight: 21 },
  trust: { fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  note: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 },
  link: { fontSize: 14 },
  dot: { fontSize: 14 },
  small: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
})
