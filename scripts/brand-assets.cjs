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

/** Background of the production app icon: rich Twilight Indigo (Proposal 1). */
const INDIGO_BG = [22, 18, 52]
/** Luminous warm champagne-brass mark for the production app icon. */
const BRASS_MARK = [228, 198, 128]
/** Variant palettes for side-by-side iOS installs (Dev, Beta/TestFlight, Production). */
const VARIANTS = {
  Inverna: {
    fill: [0.08627, 0.07059, 0.20392], // Twilight Indigo (#161234)
    markRgb: BRASS_MARK,
    diameter: 620,
    yOffset: 0,
    ribbon: false,
  },
  'Inverna-Beta': {
    fill: [0.15686, 0.10588, 0.05882], // Deep Espresso Amber (#281B0F)
    markRgb: [242, 216, 162], // Warm Cream-Gold (#F2D8A2)
    diameter: 540,
    yOffset: -58,
    ribbon: true,
  },
  'Inverna-Dev': {
    fill: [0.0549, 0.13333, 0.22745], // Deep Cobalt Steel (#0E223A)
    markRgb: [232, 241, 250], // Crisp Silver-White (#E8F1FA)
    diameter: 540,
    yOffset: -58,
    ribbon: true,
  },
}
/** The mark's diameter on the 1024 production icon: keeps the full, prominent optical scale. */
const ICON_MARK = 620

CanvasKitInit({ locateFile: (f) => path.join(path.dirname(ck), f) }).then((CK) => {
  const mark = CK.Path.MakeFromSVGString(D)
  const makePaint = (rgb) => {
    const p = new CK.Paint()
    p.setAntiAlias(true)
    p.setColor(CK.Color(rgb[0], rgb[1], rgb[2], 1))
    return p
  }
  const white = makePaint([255, 255, 255])
  const brass = makePaint(BRASS_MARK)

  const png = (file, size, diameter, bg, fg = white, yOffset = 0) => {
    const s = CK.MakeSurface(size, size)
    const c = s.getCanvas()
    c.clear(bg ? CK.Color(bg[0], bg[1], bg[2], 1) : CK.TRANSPARENT)
    const k = diameter / 256
    c.translate((size - diameter) / 2, (size - diameter) / 2 + yOffset)
    c.scale(k, k)
    c.drawPath(mark, fg)
    const out = path.join(ROOT, file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, s.makeImageSnapshot().encodeToBytes())
    console.log('wrote', file)
  }

  // App icon (Android, web, and older iOS): Twilight Indigo + Brass.
  png('assets/images/icon.png', 1024, ICON_MARK, INDIGO_BG, brass)
  // Android adaptive icon: the system adds the background and crops to its own shape,
  // so the mark sits inside the 66% safe zone.
  png('assets/images/adaptive-icon.png', 1024, 560, null, brass)
  png('assets/images/monochrome-icon.png', 1024, 560, null, white)
  // Splash (and the launch veil that takes over from it): crisp white mark alone.
  png('assets/images/splash-mark.png', 1024, 1024, null, white)
  // Browser tab.
  png('assets/images/favicon.png', 64, 46, INDIGO_BG, brass)
  // Web app (PWA) icons; the maskable 512 keeps the mark inside the 80% safe circle.
  png('public/icon-192.png', 192, 116, INDIGO_BG, brass)
  png('public/icon-512.png', 512, 310, INDIGO_BG, brass)
  png('public/apple-touch-icon.png', 180, 109, INDIGO_BG, brass)
  fs.writeFileSync(
    path.join(ROOT, 'public/icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="rgb(${INDIGO_BG.join(',')})"/><path transform="translate(101 101) scale(1.2109)" fill="rgb(${BRASS_MARK.join(',')})" d="${D}"/></svg>\n`,
  )
  console.log('wrote public/icon.svg')

  // iOS Icon Composer bundles: distinct palettes + DEV/BETA bottom ribbon layers
  // (ribbon-bg.png & ribbon-text.png are rendered by scripts/variant-icons.py).
  for (const [name, spec] of Object.entries(VARIANTS)) {
    const dir = `assets/images/${name}.icon`
    png(`${dir}/Assets/mark.png`, 1024, spec.diameter, null, makePaint(spec.markRgb), spec.yOffset)
    const rgb = (v) => `extended-srgb:${v.map((x) => x.toFixed(5)).join(',')},1.00000`
    const groups = [
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
    ]
    if (spec.ribbon) {
      groups.push({
        name: 'Ribbon',
        layers: [
          {
            name: 'Band',
            'image-name': 'ribbon-bg.png',
            glass: false,
            'fill-specializations': [{ appearance: 'tinted', value: { solid: 'extended-gray:0.25000,0.85000' } }],
          },
          {
            name: 'Label',
            'image-name': 'ribbon-text.png',
            glass: false,
            'fill-specializations': [{ appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } }],
          },
        ],
        shadow: { kind: 'neutral', opacity: 0.35 },
      })
    }
    const icon = {
      'fill-specializations': [
        { value: { solid: rgb(spec.fill) } },
        { appearance: 'dark', value: { solid: rgb(spec.fill.map((x) => x * 0.6)) } },
        { appearance: 'tinted', value: 'automatic' },
      ],
      groups,
      'supported-platforms': { squares: 'shared' },
    }
    fs.writeFileSync(path.join(ROOT, dir, 'icon.json'), JSON.stringify(icon, null, 2) + '\n')
    console.log('wrote', `${dir}/icon.json`)
  }
})
