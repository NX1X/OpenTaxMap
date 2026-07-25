import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  define: {
    // current app version, baked in at build time (fallback when GitHub has
    // no published release yet)
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
