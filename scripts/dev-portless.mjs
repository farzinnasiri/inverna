import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

// Runs Inverna's Expo Metro server behind a named Portless route (`inverna`) while
// keeping Metro bound to --lan so phones (Expo Go / dev builds) can connect
// over Wi-Fi at the same time. Leaves the shared Portless proxy and other apps
// untouched.
const cwd = fileURLToPath(new URL('..', import.meta.url))
const ROUTE_NAME = process.env.PORTLESS_NAME || 'inverna'
const BASE_PORT = Number(process.env.PORT || 8081)

let stopping = false
let metro = null
let aliasRegistered = false

function portless(args, capture = false, optional = false) {
  const result = spawnSync('portless', args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', optional ? 'ignore' : 'inherit'] : 'inherit',
  })
  if (optional) return result.stdout?.trim() || ''
  if (result.error || result.status !== 0) {
    if (result.error?.code === 'ENOENT') {
      console.error('Install Portless first: pnpm add --global portless')
    }
    process.exit(result.status || 1)
  }
  return result.stdout?.trim() || ''
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ port, host: '0.0.0.0' }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function pickFreePort(startPort) {
  for (let p = startPort; p < startPort + 40; p++) {
    if (await isPortFree(p)) return String(p)
  }
  throw new Error(`No free port found starting at ${startPort}`)
}

function cleanupAlias() {
  if (!aliasRegistered) return
  aliasRegistered = false
  spawnSync('portless', ['alias', '--remove', ROUTE_NAME], { cwd, stdio: 'ignore' })
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  cleanupAlias()
  if (metro && !metro.killed) {
    metro.kill('SIGTERM')
  }
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
process.on('exit', cleanupAlias)

// Ensure shared Portless proxy is running without disturbing other projects.
portless(['proxy', 'start'])

const metroPort = await pickFreePort(BASE_PORT)
portless(['alias', '--remove', ROUTE_NAME], true, true)
portless(['alias', ROUTE_NAME, metroPort])
aliasRegistered = true

const url = portless(['get', ROUTE_NAME], true)
const useDevClient = process.env.EXPO_DEV_CLIENT === '1'
const expoArgs = ['exec', 'expo', 'start', ...(useDevClient ? ['--dev-client'] : []), '--lan', '--port', metroPort]
console.log(`\n› Portless: ${url}  ->  Metro :${metroPort} (${useDevClient ? '--dev-client ' : ''}--lan)\n`)

metro = spawn('pnpm', expoArgs, {
  cwd,
  env: { ...process.env },
  stdio: 'inherit',
})

metro.on('error', (error) => {
  console.error(`Could not start Metro: ${error.message}`)
  stop(1)
})

metro.on('exit', (code, signal) => {
  metro = null
  stop(code ?? (signal === 'SIGTERM' ? 0 : 1))
})
