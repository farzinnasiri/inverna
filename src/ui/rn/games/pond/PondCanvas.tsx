/**
 * The pond on screen: a low-resolution water shader scaled up underneath,
 * and one picture per frame on top (koi under the surface, the pond's still
 * life, then buds, strokes, ink and the painting). The still life is
 * recorded once per pond and stamped into each frame. Pictures are recorded
 * on the UI thread from the latest snapshot; the engine runs on the JS thread.
 *
 * Default export so the web build can lazy-load it after CanvasKit is ready.
 */
import { useMemo } from 'react'
import { PixelRatio, View } from 'react-native'
import { Canvas, ClipOp, Fill, PaintStyle, Picture, Shader, Skia, StrokeCap, StrokeJoin, TileMode, createPicture } from '@shopify/react-native-skia'
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { drawFlora, drawOver, drawUnder, makePondGfx, waterUniforms, type FloraFrame, type PondFrame, type PondGfx, type PondGfxEnums } from './draw'
import { WATER_SKSL } from './waterShader'

export interface PondCanvasProps {
  frame: SharedValue<PondFrame | null>
  flora: SharedValue<FloraFrame | null>
  width: number
  height: number
  /** Dev: milliseconds the UI thread spent recording the last frame. */
  uiMs?: SharedValue<number>
}

const ENUMS: PondGfxEnums = {
  stroke: PaintStyle.Stroke,
  fill: PaintStyle.Fill,
  roundCap: StrokeCap.Round,
  roundJoin: StrokeJoin.Round,
  clipIntersect: ClipOp.Intersect,
  clamp: TileMode.Clamp,
}

/** One water pixel per this many points: it's all soft light, so the upscale is invisible. */
const WATER_PT_PER_PX = 1.5

const waterEffect = Skia.RuntimeEffect.Make(WATER_SKSL)
if (!waterEffect && __DEV__) console.warn('[pond] water shader failed to compile')

const EMPTY_RIP = [0, 0, 0, 0]

export default function PondCanvas({ frame, flora, width, height, uiMs }: PondCanvasProps) {
  const holder = useSharedValue<{ gfx: PondGfx | null; flora: PondGfx | null }>({ gfx: null, flora: null })
  const bounds = useMemo(() => Skia.XYWHRect(0, 0, width, height), [width, height])

  const k = WATER_PT_PER_PX * PixelRatio.get()
  const fw = Math.max(1, Math.round(width / k))
  const fh = Math.max(1, Math.round(height / k))

  const uniforms = useDerivedValue(() => {
    const f = frame.get()
    if (!f) {
      return { res: [fw, fh], t: 0, dim: 1, veil: 0, rest: 0, moon: [0.76, 0.3], light: [0.9, 0.9, 0.9], koi: [0, 0, 0, 0], rip: [EMPTY_RIP, EMPTY_RIP, EMPTY_RIP, EMPTY_RIP, EMPTY_RIP, EMPTY_RIP, EMPTY_RIP, EMPTY_RIP] }
    }
    return waterUniforms(f, fw, fh)
  })

  // The still life: recorded when the pond (or the hour's dimming) changes.
  const floraPicture = useDerivedValue(() => {
    const fl = flora.get()
    const h = holder.get()
    if (!fl) return null
    if (!h.flora) h.flora = makePondGfx(Skia, ENUMS, { colorKey: 0, brass: fl.brass, ivory: fl.ivory, tints: [...fl.brass, ...fl.brass, ...fl.brass, ...fl.brass, ...fl.brass] })
    const g = h.flora
    return createPicture((canvas) => drawFlora(canvas, fl, g), bounds)
  })

  const picture = useDerivedValue(() => {
    const f = frame.get()
    const still = floraPicture.get()
    const h = holder.get()
    const t0 = uiMs && typeof performance !== 'undefined' ? performance.now() : 0
    const pic = createPicture((canvas) => {
      if (!f) return
      if (!h.gfx || h.gfx.key !== f.colorKey) h.gfx = makePondGfx(Skia, ENUMS, f)
      drawUnder(canvas, f, h.gfx)
      if (still) canvas.drawPicture(still)
      drawOver(canvas, f, h.gfx)
    }, bounds)
    if (uiMs && t0) uiMs.set(performance.now() - t0)
    return pic
  })

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#000' }}>
      {waterEffect ? (
        // The transform lives on a wrapping View: Skia's web Canvas ignores transforms in its own style.
        <View
          style={{
            position: 'absolute',
            width: fw,
            height: fh,
            left: (width - fw) / 2,
            top: (height - fh) / 2,
            transform: [{ scaleX: width / fw }, { scaleY: height / fh }],
          }}
        >
          <Canvas style={{ width: fw, height: fh }}>
            <Fill>
              <Shader source={waterEffect} uniforms={uniforms} />
            </Fill>
          </Canvas>
        </View>
      ) : null}
      <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  )
}
