import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  presetWebFonts,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'flex-col-center': 'flex flex-col items-center justify-center',
    'text-primary': 'text-[var(--primary-color)]',
    'text-secondary': 'text-[var(--text-color-secondary)]',
    'bg-base': 'bg-[var(--body-color)]',
    'bg-card': 'bg-[var(--card-color)]',
    'border-base': 'border-[var(--border-color)]',
  },
  theme: {
    colors: {
      primary: 'var(--primary-color)',
      success: 'var(--success-color)',
      warning: 'var(--warning-color)',
      error: 'var(--error-color)',
      info: 'var(--info-color)',
    },
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'Inter:400,500,600,700',
        mono: 'JetBrains Mono',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  safelist: [
    // Menu icons
    'i-carbon-dashboard',
    'i-carbon-enterprise',
    'i-carbon-bare-metal-server',
    'i-carbon-user-admin',
    'i-carbon-catalog',
    'i-carbon-document',
    'i-carbon-chart-line',
    'i-carbon-cloud-services',
    // Header icons
    'i-carbon-home',
    'i-carbon-language',
    'i-carbon-sun',
    'i-carbon-moon',
    // User dropdown icons
    'i-carbon-user',
    'i-carbon-logout',
    'i-carbon-settings',
    'i-carbon-translate',
  ],
})
