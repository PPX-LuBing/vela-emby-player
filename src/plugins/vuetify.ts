import 'vuetify/styles'
import { createVuetify } from 'vuetify'

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'embyDark',
    themes: {
      embyDark: {
        dark: true,
        colors: {
          background: '#0f141b',
          surface: '#1b222c',
          'surface-bright': '#242c37',
          'surface-variant': '#303844',
          primary: '#99cbff',
          'primary-container': '#143a57',
          secondary: '#c7d4e2',
          'secondary-container': '#303844',
          error: '#ffb4ab',
          'error-container': '#5f171d',
          outline: '#8b9bad',
          'on-background': '#eef5ff',
          'on-surface': '#eef5ff',
          'on-primary': '#001d31',
          'on-primary-container': '#d2e9ff',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      rounded: 'md',
      minHeight: 40,
    },
    VCard: {
      rounded: 'lg',
      elevation: 0,
    },
    VTextField: {
      variant: 'filled',
      density: 'comfortable',
      color: 'primary',
    },
    VSelect: {
      variant: 'filled',
      density: 'comfortable',
      color: 'primary',
    },
    VSlider: {
      density: 'compact',
      thumbSize: 14,
      trackSize: 4,
    },
    VAlert: {
      rounded: 'md',
      density: 'comfortable',
    },
    VDialog: {
      scrollable: true,
    },
  },
})
