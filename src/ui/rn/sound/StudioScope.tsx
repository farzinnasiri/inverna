import StudioScopeCanvas, { ROW_CHORDS, ROW_COUNT, ROW_H, ROW_PULSE, type StudioScopeProps } from './StudioScopeCanvas'

export type { StudioScopeProps }
export { ROW_CHORDS, ROW_COUNT, ROW_H, ROW_PULSE }

/** Native: Skia is built in, render directly. Web loads CanvasKit first (StudioScope.web.tsx). */
export function StudioScope(props: StudioScopeProps) {
  return <StudioScopeCanvas {...props} />
}
