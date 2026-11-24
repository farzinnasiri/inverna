import BackdropCanvas, { type BackdropCanvasProps } from './BackdropCanvas'

/** Native: Skia is built in, render directly. Web loads CanvasKit first (SkiaBackdrop.web.tsx). */
export function SkiaBackdrop(props: BackdropCanvasProps) {
  return <BackdropCanvas {...props} />
}
