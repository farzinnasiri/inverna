/**
 * Makes every Inverna icon and mark image from one source:
 * assets/brand/inverna-mark.svg (the mark, white, on a 256 grid).
 *
 *   node scripts/brand-assets.cjs
 *   uv run --with pillow python scripts/variant-icons.py   # then the Dev/Beta PNG bands
 *
 * iOS uses Icon Composer bundles (assets/images/Inverna*.icon): one glass
 * layer (the mark) over a solid fill, which iOS 26 renders in every mode
 * itself: default, dark, clear (Liquid Glass) and tinted. Dev and Beta get
 * their own fill colour so the three apps are easy to tell apart.
 * The PNGs are for Android, the web, the splash screen and older iOS.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ck = require.resolve('canvaskit-wasm/bin/full/canvaskit.js', {
  paths: [require.resolve('@shopify/react-native-skia/package.json', { paths: [ROOT] })],
})
const CanvasKitInit = require(ck)

const svg = fs.readFileSync(path.join(ROOT, 'assets/brand/inverna-mark.svg'), 'utf8')
const D = svg.match(/ d="([^"]+)"/)[1]

/** Background of the app icon: the app's own near-black, a touch of blue. */
const INK = [10, 12, 16]
/** Icon Composer fills (extended sRGB, 0..1). */
const FILLS = {
  Inverna: [0.039, 0.047, 0.063],
  'Inverna-Dev': [0.086, 0.137, 0.227],
  'Inverna-Beta': [0.165, 0.133, 0.078],
}
/** The mark's diameter on a 1024 icon: the same optical size as the reference renders. */
const ICON_MARK = 620

CanvasKitInit({ locateFile: (f) => path.join(path.dirname(ck), f) }).then((CK) => {
  const mark = CK.Path.MakeFromSVGString(D)
  const white = new CK.Paint()
  white.setAntiAlias(true)
  white.setColor(CK.WHITE)

  const png = (file, size, diameter, bg) => {
    const s = CK.MakeSurface(size, size)
    const c = s.getCanvas()
    c.clear(bg ? CK.Color(bg[0], bg[1], bg[2], 1) : CK.TRANSPARENT)
    const k = diameter / 256
    c.translate((size - diameter) / 2, (size - diameter) / 2)
    c.scale(k, k)
    c.drawPath(mark, white)
    const out = path.join(ROOT, file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, s.makeImageSnapshot().encodeToBytes())
    console.log('wrote', file)
  }

  // App icon (Android, web, and the source of the Dev/Beta bands).
  png('assets/images/icon.png', 1024, ICON_MARK, INK)
  // Android adaptive icon: the system adds the background and crops to its own shape,
  // so the mark sits inside the 66% safe zone.
  png('assets/images/adaptive-icon.png', 1024, 560, null)
  png('assets/images/monochrome-icon.png', 1024, 560, null)
  // Splash (and the launch veil that takes over from it): the mark alone.
  png('assets/images/splash-mark.png', 1024, 1024, null)
  // Browser tab.
  png('assets/images/favicon.png', 64, 46, INK)

  // iOS Icon Composer bundles.
  for (const [name, fill] of Object.entries(FILLS)) {
    const dir = `assets/images/${name}.icon`
    png(`${dir}/Assets/mark.png`, 1024, ICON_MARK, null)
    const rgb = (v) => `extended-srgb:${v.map((x) => x.toFixed(5)).join(',')},1.00000`
    const icon = {
      'fill-specializations': [
        { value: { solid: rgb(fill) } },
        { appearance: 'dark', value: { solid: rgb(fill.map((x) => x * 0.6)) } },
        { appearance: 'tinted', value: 'automatic' },
      ],
      groups: [
        {
          name: 'Mark',
          layers: [
            {
              name: 'Mark',
              'image-name': 'mark.png',
              glass: true,
              'fill-specializations': [{ appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } }],
            },
          ],
          translucency: { enabled: true, value: 0.2 },
          shadow: { kind: 'neutral', opacity: 0.4 },
        },
      ],
      'supported-platforms': { squares: 'shared' },
    }
    fs.writeFileSync(path.join(ROOT, dir, 'icon.json'), JSON.stringify(icon, null, 2) + '\n')
    console.log('wrote', `${dir}/icon.json`)
  }
})
