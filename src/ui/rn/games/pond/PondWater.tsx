import PondCanvas, { type PondCanvasProps } from './PondCanvas'

/** Native: Skia is built in, render directly. Web loads CanvasKit first (PondWater.web.tsx). */
export function PondWater(props: PondCanvasProps) {
  return <PondCanvas {...props} />
}
