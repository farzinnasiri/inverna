import LensLightCanvas, { type LensLightProps } from './LensLightCanvas'

export type { LensLightProps }

/** Native: Skia is built in, render directly. Web loads CanvasKit first (LensLight.web.tsx). */
export function LensLight(props: LensLightProps) {
  return <LensLightCanvas {...props} />
}
