import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { StudioScopeProps } from './StudioScopeCanvas'

export type { StudioScopeProps }
/** Kept in step with StudioScopeCanvas (importing it here would load Skia before CanvasKit). */
export const ROW_CHORDS = 7
export const ROW_PULSE = 8
export const ROW_COUNT = 9
export const ROW_H = 30

/** Web: load CanvasKit before the Skia module is evaluated. */
export function StudioScope(props: StudioScopeProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./StudioScopeCanvas')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  )
}
