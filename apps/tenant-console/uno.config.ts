import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  presetWebFonts,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { icons as carbonIcons } from '@iconify-json/carbon'

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
    // Trading specific
    'text-profit': 'text-[var(--profit-color)]',
    'text-loss': 'text-[var(--loss-color)]',
    'text-buy': 'text-[var(--buy-color)]',
    'text-sell': 'text-[var(--sell-color)]',
  },
  theme: {
    colors: {
      primary: 'var(--primary-color)',
      success: 'var(--success-color)',
      warning: 'var(--warning-color)',
      error: 'var(--error-color)',
      info: 'var(--info-color)',
      profit: 'var(--profit-color)',
      loss: 'var(--loss-color)',
      buy: 'var(--buy-color)',
      sell: 'var(--sell-color)',
    },
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        carbon: () => carbonIcons,
      },
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
    // Navigation icons
    'i-carbon-dashboard',
    'i-carbon-user-multiple',
    'i-carbon-user',
    'i-carbon-chart-line',
    'i-carbon-document',
    'i-carbon-settings',
    'i-carbon-logout',
    'i-carbon-sun',
    'i-carbon-moon',
    'i-carbon-translate',
    // Trading icons
    'i-carbon-currency-dollar',
    'i-carbon-growth',
    'i-carbon-arrow-down',
    'i-carbon-activity',
    'i-carbon-analytics',
    'i-carbon-warning',
    'i-carbon-checkmark-filled',
    'i-carbon-close-filled',
    // Action icons
    'i-carbon-add',
    'i-carbon-edit',
    'i-carbon-trash-can',
    'i-carbon-renew',
    'i-carbon-download',
    'i-carbon-upload',
    'i-carbon-search',
    'i-carbon-filter',
    'i-carbon-menu',
    'i-carbon-chevron-left',
    'i-carbon-chevron-right',
    'i-carbon-chevron-down',
    'i-carbon-chevron-up',
    'i-carbon-overflow-menu-vertical',
    // Status icons
    'i-carbon-circle-filled',
    'i-carbon-circle-dash',
    'i-carbon-api',
    'i-carbon-password',
    'i-carbon-enterprise',
    'i-carbon-badge',
    // Report icons
    'i-carbon-user-activity',
    'i-carbon-user-follow',
    'i-carbon-percentage',
    'i-carbon-trophy',
    'i-carbon-purchase',
    'i-carbon-time',
  ],
})
