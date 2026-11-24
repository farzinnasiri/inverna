import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'
import type { BackdropCanvasProps } from './BackdropCanvas'

/**
 * Web: load CanvasKit (public/canvaskit.wasm, copied by `pnpm install`) before
 * the Skia canvas module is evaluated. The rest of the app renders meanwhile;
 * the backdrop appears once the wasm is ready (precached by the PWA afterwards).
 */
export function SkiaBackdrop(props: BackdropCanvasProps) {
  return (
    <WithSkiaWeb
      getComponent={() => import('./BackdropCanvas')}
      componentProps={props}
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={null}
    />
  )
}
