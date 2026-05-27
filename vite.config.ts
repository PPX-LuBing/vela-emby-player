import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
      sass: {
        api: 'modern-compiler',
      },
    },
  },
  plugins: [
    vue(),
    vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/assets/vuetify-settings.scss',
      },
    }),
    UnoCSS(),
  ],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'INVALID_ANNOTATION' &&
          warning.id?.includes('@vueuse/core')
        ) {
          return
        }

        warn(warning)
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vuetify')) {
            return 'vuetify'
          }
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
