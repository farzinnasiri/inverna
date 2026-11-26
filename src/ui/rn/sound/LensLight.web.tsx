import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { LensLightProps } from './LensLightCanvas'

export type { LensLightProps }

/** Web: load CanvasKit before the Skia module is evaluated; the glass shows meanwhile. */
export function LensLight(props: LensLightProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./LensLightCanvas')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  )
}
