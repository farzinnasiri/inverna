import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { PondCanvasProps } from './PondCanvas'

/**
 * Web: load CanvasKit (public/canvaskit.wasm) before the Skia canvas module is
 * evaluated, as the backdrop does. The water stays black until it's ready.
 */
export function PondWater(props: PondCanvasProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./PondCanvas')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  )
}
