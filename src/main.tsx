import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import './ui/styles/global.css'
import './ui/styles/components.css'
import './ui/styles/screens.css'
import { applyTokens } from './design/tokens'
import { bootPlatform } from './platform'
import { App } from './ui/App'

applyTokens({ warmth: 0, force: true })
bootPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
