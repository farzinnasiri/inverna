/**
 * Side-effect boot module. Imported first in app/_layout.tsx so native
 * `expo-sqlite/localStorage` and Lull's synchronous key-value store are
 * installed BEFORE any Zustand persist store evaluates and hydrates.
 */
import 'expo-sqlite/localStorage/install'
import { bootPlatform } from './index'

bootPlatform()
