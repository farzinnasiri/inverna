import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const res = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--clear'], {
  stdio: 'inherit',
})
if (res.status !== 0) process.exit(res.status ?? 1)

const dist = path.resolve('dist')
const index = path.join(dist, 'index.html')
if (!fs.existsSync(index)) throw new Error('Expo did not generate dist/index.html')

let html = fs.readFileSync(index, 'utf8')
const headInject = `<style>html,body{background:#000000;margin:0;color-scheme:dark}</style>
<meta name="theme-color" content="#000000" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Inverna" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script>if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}</script>`

if (!html.includes('manifest.webmanifest')) {
  html = html.replace('</head>', `${headInject}\n</head>`)
}
html = html.replace('initial-scale=1, shrink-to-fit=no', 'initial-scale=1, viewport-fit=cover, user-scalable=no')
html = html.replace(/<title>.*?<\/title>/, '<title>Inverna</title>')
fs.writeFileSync(index, html)

// Collect precache list for offline PWA service worker
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (!['sw.js', 'metadata.json'].includes(entry.name) && !entry.name.endsWith('.map')) {
      files.push('/' + path.relative(dist, full).split(path.sep).join('/'))
    }
  }
}
walk(dist)
files.sort()

const hash = crypto.createHash('sha256')
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dist, f)))
const cacheName = `inverna-${hash.digest('hex').slice(0, 14)}`

const sw = fs
  .readFileSync(path.resolve('public/sw.js'), 'utf8')
  .replace('"__INVERNA_CACHE__"', JSON.stringify(cacheName))
  .replace('/* precache */ []', JSON.stringify(files))
fs.writeFileSync(path.join(dist, 'sw.js'), sw)

console.log(`Inverna Web PWA ready (${files.length} precached files, ${cacheName}).`)
