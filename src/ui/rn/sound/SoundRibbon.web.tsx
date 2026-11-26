import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { RibbonProps } from './RibbonCanvas'

export type { RibbonProps }

/** Web: load CanvasKit before the Skia module is evaluated. */
export function SoundRibbon(props: RibbonProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./RibbonCanvas')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  )
}
