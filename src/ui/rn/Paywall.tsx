import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Gamepad2, Infinity as InfinityIcon, Lock, LockOpen, ShieldOff, SunMoon, Users, Waves, WifiOff } from 'lucide-react-native'
import { canPreviewFreeTier } from '@/platform'
import { feel } from '@/ui/feel'
import { paywall as copy } from '@/ui/copy'
import { PRIVACY_URL } from '@/ui/links'
import { useTokenColors } from '@/ui/hooks/useTokenColors'
import { useNav, type PaywallContext } from '@/ui/state/nav'
import { useIsUnlocked, useUnlock } from '@/ui/state/unlock'
import { AmbientBackdrop } from './AmbientBackdrop'
import { Button, Sheet } from './controls'
import { GLASS_TINT, GlassSurface } from './Glass'
import { useResponsiveLayout } from './hooks'

/** Twilight Indigo accent dedicated to Full Unlock (brass stays reserved for selections). */
export const UPGRADE_INK = '#BFB5FF'

const FEATURE_ITEMS = [
  {
    key: 'games' as const,
    Icon: Gamepad2,
    ink: '#BFB5FF',
    bg: 'rgba(142, 124, 255, 0.16)',
    border: 'rgba(142, 124, 255, 0.34)',
  },
  {
    key: 'sounds' as const,
    Icon: Waves,
    ink: '#8BE0EA',
    bg: 'rgba(63, 184, 201, 0.16)',
    border: 'rgba(63, 184, 201, 0.34)',
  },
  {
    key: 'light' as const,
    Icon: SunMoon,
    ink: '#FFC88C',
    bg: 'rgba(240, 154, 69, 0.16)',
    border: 'rgba(240, 154, 69, 0.34)',
  },
] as const

const TRUST_PILLS = [
  {
    key: 'offline' as const,
    Icon: WifiOff,
    ink: '#8EC5FF',
    bg: 'rgba(100, 168, 255, 0.13)',
    border: 'rgba(100, 168, 255, 0.28)',
  },
  {
    key: 'once' as const,
    Icon: InfinityIcon,
    ink: '#7CE0B0',
    bg: 'rgba(82, 204, 146, 0.13)',
    border: 'rgba(82, 204, 146, 0.28)',
  },
  {
    key: 'noAds' as const,
    Icon: ShieldOff,
    ink: '#F6A59B',
    bg: 'rgba(240, 132, 118, 0.13)',
    border: 'rgba(240, 132, 118, 0.28)',
  },
  {
    key: 'private' as const,
    Icon: Lock,
    ink: '#C4B8FF',
    bg: 'rgba(164, 148, 255, 0.13)',
    border: 'rgba(164, 148, 255, 0.28)',
  },
] as const

/** Visual feature stack shared by the Paywall sheet and Onboarding's final tier explainer. */
export function UnlockFeatureStack({ compact = false }: { compact?: boolean }) {
  const { color } = useTokenColors()
  return (
    <GlassSurface variant="card" radius={20} style={[styles.card, compact ? styles.cardCompact : null]}>
      {FEATURE_ITEMS.map(({ key, Icon, ink, bg, border }, idx) => {
        const item = copy.features[key]
        return (
          <View
            key={key}
            style={[
              styles.featureRow,
              idx > 0 ? [styles.featureDiv, { borderTopColor: color.line }] : null,
              compact ? styles.featureRowCompact : null,
            ]}
          >
            <View style={[styles.iconBadge, compact ? styles.iconBadgeCompact : null, { backgroundColor: bg, borderColor: border }]}>
              <Icon size={compact ? 15 : 17} strokeWidth={1.85} color={ink} />
            </View>
            <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, compact ? styles.featureTitleCompact : null, { color: color.ink }]}>
                {item.title}
              </Text>
              <Text style={[styles.featureDetail, { color: color.ink2 }]} numberOfLines={compact ? 1 : 2}>
                {item.detail}
              </Text>
            </View>
          </View>
        )
      })}
    </GlassSurface>
  )
}

/** Four compact colorful ownership & privacy chips (zero wall of text). */
export function TrustPillGrid() {
  return (
    <View style={styles.pillGrid}>
      {TRUST_PILLS.map(({ key, Icon, ink, bg, border }) => (
        <View key={key} style={[styles.trustPill, { backgroundColor: bg, borderColor: border }]}>
          <Icon size={13} strokeWidth={2} color={ink} />
          <Text style={[styles.trustPillText, { color: ink }]} numberOfLines={1}>
            {copy.pills[key]}
          </Text>
        </View>
      ))}
    </View>
  )
}

function headingFor(ctx: PaywallContext | null): { title: string; body: string } {
  switch (ctx?.reason) {
    case 'game':
      return { title: copy.titleForGame(ctx.label), body: copy.body }
    case 'sound':
      return { title: copy.titleForSound(ctx.label), body: copy.body }
    case 'custom-sound':
      return { title: copy.titleForCustomSound, body: copy.bodyForCustomSound }
    case 'manual-light':
      return { title: copy.titleForManualLight, body: copy.bodyForManualLight }
    default:
      return { title: copy.title, body: copy.body }
  }
}

function PaywallBody({ context, onDismiss }: { context: PaywallContext | null; onDismiss: () => void }) {
  const { color } = useTokenColors()
  const price = useUnlock((s) => s.price)
  const loadingProduct = useUnlock((s) => s.loadingProduct)
  const familyShareable = useUnlock((s) => s.familyShareable)
  const unreachable = useUnlock((s) => s.unreachable)
  const devPreviewFree = useUnlock((s) => s.devPreviewFree)
  const busy = useUnlock((s) => s.busy)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    setNote(null)
    void useUnlock.getState().check()
  }, [context?.reason, context?.label])

  const { title, body } = headingFor(context)
  const inDevPreview = canPreviewFreeTier && devPreviewFree
  const showUnavailable = !inDevPreview && !loadingProduct && !price && unreachable

  const retryPrice = () => {
    if (busy || loadingProduct) return
    setNote(null)
    void useUnlock.getState().check()
  }

  const buy = async () => {
    if (busy) return
    feel('commit')
    setNote(null)
    const res = await useUnlock.getState().buy()
    if (res === 'pending') setNote(copy.pending)
    else if (res === 'failed') setNote(useUnlock.getState().unreachable ? copy.unreachable : copy.failed)
  }

  const restore = async () => {
    if (busy) return
    setNote(null)
    const owned = await useUnlock.getState().restore()
    if (owned === null) setNote(copy.unreachable)
    else if (!owned) setNote(copy.nothingToRestore)
  }

  return (
    <View style={styles.column}>
      <View style={styles.header}>
        <GlassSurface variant="pill" radius={999} tint={GLASS_TINT.upgrade} style={styles.badge}>
          <LockOpen size={13} strokeWidth={2} color={UPGRADE_INK} />
          <Text style={[styles.badgeText, { color: UPGRADE_INK }]}>Full Unlock</Text>
        </GlassSurface>
        <Text accessibilityRole="header" style={[styles.title, { color: color.ink }]}>
          {title}
        </Text>
        <Text style={[styles.body, { color: color.ink2 }]}>{body}</Text>
      </View>

      <UnlockFeatureStack />
      <TrustPillGrid />

      <View style={styles.actions}>
        <Button variant="upgrade" block disabled={busy !== null || loadingProduct || !price} onPress={() => void buy()}>
          {busy === 'buy' || (loadingProduct && !price) ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            copy.cta(price)
          )}
        </Button>
        {familyShareable ? (
          <View style={styles.familyRow}>
            <Users size={13} strokeWidth={1.8} color={UPGRADE_INK} />
            <Text style={[styles.familyText, { color: color.ink3 }]}>{copy.familySharing}</Text>
          </View>
        ) : null}
        <Button variant="ghost" size="sm" block onPress={onDismiss}>
          {copy.notNow}
        </Button>
      </View>

      {inDevPreview ? <Text style={[styles.note, { color: UPGRADE_INK }]}>{copy.devPreviewNote}</Text> : null}

      {note || showUnavailable ? (
        <View style={styles.statusWrap}>
          <Text accessibilityLiveRegion="polite" style={[styles.note, { color: color.ink2 }]}>
            {note ?? copy.unreachable}
          </Text>
          {showUnavailable ? (
            <Pressable accessibilityRole="button" onPress={retryPrice} hitSlop={8}>
              <Text style={[styles.retryLink, { color: UPGRADE_INK }]}>{copy.retry}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.links}>
        <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void restore()} hitSlop={8}>
          <Text style={[styles.link, { color: color.ink2 }]}>{busy === 'restore' ? '…' : copy.restore}</Text>
        </Pressable>
        <Text style={[styles.dot, { color: color.ink3 }]}>·</Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8}>
          <Text style={[styles.link, { color: color.ink3 }]}>{copy.privacy}</Text>
        </Pressable>
      </View>
    </View>
  )
}

/** Global dismissible Full Unlock sheet, mounted in RootLayout. */
export function PaywallSheet() {
  const paywall = useNav((s) => s.paywall)
  const closePaywall = useNav((s) => s.closePaywall)
  const unlocked = useIsUnlocked()

  // Close cleanly the moment purchase or restore succeeds.
  useEffect(() => {
    if (unlocked && paywall) closePaywall()
  }, [unlocked, paywall, closePaywall])

  return (
    <Sheet open={paywall !== null} onClose={closePaywall} label={copy.title}>
      <PaywallBody context={paywall} onDismiss={closePaywall} />
    </Sheet>
  )
}

/** Standalone route (/paywall), dismissible back to Play. */
export function Paywall() {
  const { insets, sideMargin, frameWidth } = useResponsiveLayout()
  const unlocked = useIsUnlocked()
  const dismiss = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  useEffect(() => {
    if (unlocked) router.replace('/')
  }, [unlocked])

  return (
    <View style={styles.root}>
      <AmbientBackdrop presetId="deep-drift" />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 16) + 12, paddingHorizontal: sideMargin },
        ]}
      >
        <View style={{ width: '100%', maxWidth: frameWidth }}>
          <PaywallBody context={{ reason: 'general' }} onDismiss={dismiss} />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', gap: 14 },
  header: { gap: 6 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  title: { fontSize: 27, fontWeight: '600', letterSpacing: -0.6, lineHeight: 33 },
  body: { fontSize: 15, lineHeight: 21 },
  card: { paddingHorizontal: 14, paddingVertical: 4 },
  cardCompact: { paddingHorizontal: 12, paddingVertical: 2 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  featureRowCompact: { paddingVertical: 8, gap: 10 },
  featureDiv: { borderTopWidth: StyleSheet.hairlineWidth },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeCompact: { width: 32, height: 32, borderRadius: 10 },
  featureCopy: { flex: 1, gap: 1 },
  featureTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  featureTitleCompact: { fontSize: 14 },
  featureDetail: { fontSize: 13, lineHeight: 18 },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trustPill: {
    width: '48.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  trustPillText: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1 },
  actions: { gap: 8, marginTop: 2 },
  familyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  familyText: { fontSize: 12.5 },
  statusWrap: { alignItems: 'center', gap: 4 },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retryLink: { fontSize: 13, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  link: { fontSize: 13 },
  dot: { fontSize: 13 },
})
