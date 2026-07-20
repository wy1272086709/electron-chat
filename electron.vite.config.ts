import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode)

  return {
    main: {
      define: {
        'process.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL)
      },
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    preload: {
      build: {
        rollupOptions: {
          input: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [tailwindcss()]
    }
  }
})
