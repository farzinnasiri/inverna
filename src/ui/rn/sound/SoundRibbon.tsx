import RibbonCanvas, { type RibbonProps } from './RibbonCanvas'

export type { RibbonProps }

/** Native: Skia is built in, render directly. Web loads CanvasKit first (SoundRibbon.web.tsx). */
export function SoundRibbon(props: RibbonProps) {
  return <RibbonCanvas {...props} />
}
