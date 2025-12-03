<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('quotes.title') }}</h1>
      <div class="flex items-center gap-4">
        <n-input
          v-model:value="searchSymbol"
          :placeholder="t('quotes.searchSymbol')"
          clearable
          style="width: 200px"
        >
          <template #prefix>
            <span class="i-carbon-search"></span>
          </template>
        </n-input>
        <n-switch v-model:value="autoRefresh" size="small">
          <template #checked>{{ t('quotes.autoRefresh') }}</template>
          <template #unchecked>{{ t('quotes.autoRefresh') }}</template>
        </n-switch>
        <n-button quaternary circle @click="loadQuotes">
          <template #icon>
            <span class="i-carbon-refresh"></span>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Category Tabs -->
    <n-card class="quotes-card">
      <n-tabs v-model:value="activeCategory" type="line">
        <n-tab-pane name="all" :tab="t('quotes.allSymbols')">
          <div class="quotes-grid">
            <div
              v-for="quote in filteredQuotes"
              :key="quote.symbol"
              class="quote-card"
              :class="{ selected: selectedSymbol === quote.symbol }"
              @click="selectSymbol(quote)"
            >
              <div class="quote-header">
                <span class="quote-symbol">{{ quote.symbol }}</span>
                <n-tag size="tiny" :type="getSpreadType(quote)">
                  {{ quote.spread.toFixed(1) }}
                </n-tag>
              </div>
              <div class="quote-prices">
                <div class="price bid" :class="getPriceClass(quote, 'bid')">
                  <span class="price-label">{{ t('quotes.bid') }}</span>
                  <span class="price-value">{{ formatPrice(quote.bid, quote.digits) }}</span>
                </div>
                <div class="price ask" :class="getPriceClass(quote, 'ask')">
                  <span class="price-label">{{ t('quotes.ask') }}</span>
                  <span class="price-value">{{ formatPrice(quote.ask, quote.digits) }}</span>
                </div>
              </div>
              <div class="quote-footer">
                <span class="quote-time">{{ formatTime(quote.time) }}</span>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="forex" :tab="t('quotes.forex')">
          <div class="quotes-grid">
            <div
              v-for="quote in forexQuotes"
              :key="quote.symbol"
              class="quote-card"
              :class="{ selected: selectedSymbol === quote.symbol }"
              @click="selectSymbol(quote)"
            >
              <div class="quote-header">
                <span class="quote-symbol">{{ quote.symbol }}</span>
                <n-tag size="tiny" :type="getSpreadType(quote)">
                  {{ quote.spread.toFixed(1) }}
                </n-tag>
              </div>
              <div class="quote-prices">
                <div class="price bid" :class="getPriceClass(quote, 'bid')">
                  <span class="price-label">{{ t('quotes.bid') }}</span>
                  <span class="price-value">{{ formatPrice(quote.bid, quote.digits) }}</span>
                </div>
                <div class="price ask" :class="getPriceClass(quote, 'ask')">
                  <span class="price-label">{{ t('quotes.ask') }}</span>
                  <span class="price-value">{{ formatPrice(quote.ask, quote.digits) }}</span>
                </div>
              </div>
              <div class="quote-footer">
                <span class="quote-time">{{ formatTime(quote.time) }}</span>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="metals" :tab="t('quotes.metals')">
          <div class="quotes-grid">
            <div
              v-for="quote in metalQuotes"
              :key="quote.symbol"
              class="quote-card"
              :class="{ selected: selectedSymbol === quote.symbol }"
              @click="selectSymbol(quote)"
            >
              <div class="quote-header">
                <span class="quote-symbol">{{ quote.symbol }}</span>
                <n-tag size="tiny" :type="getSpreadType(quote)">
                  {{ quote.spread.toFixed(1) }}
                </n-tag>
              </div>
              <div class="quote-prices">
                <div class="price bid" :class="getPriceClass(quote, 'bid')">
                  <span class="price-label">{{ t('quotes.bid') }}</span>
                  <span class="price-value">{{ formatPrice(quote.bid, quote.digits) }}</span>
                </div>
                <div class="price ask" :class="getPriceClass(quote, 'ask')">
                  <span class="price-label">{{ t('quotes.ask') }}</span>
                  <span class="price-value">{{ formatPrice(quote.ask, quote.digits) }}</span>
                </div>
              </div>
              <div class="quote-footer">
                <span class="quote-time">{{ formatTime(quote.time) }}</span>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="crypto" :tab="t('quotes.crypto')">
          <div class="quotes-grid">
            <div
              v-for="quote in cryptoQuotes"
              :key="quote.symbol"
              class="quote-card"
              :class="{ selected: selectedSymbol === quote.symbol }"
              @click="selectSymbol(quote)"
            >
              <div class="quote-header">
                <span class="quote-symbol">{{ quote.symbol }}</span>
                <n-tag size="tiny" :type="getSpreadType(quote)">
                  {{ quote.spread.toFixed(1) }}
                </n-tag>
              </div>
              <div class="quote-prices">
                <div class="price bid" :class="getPriceClass(quote, 'bid')">
                  <span class="price-label">{{ t('quotes.bid') }}</span>
                  <span class="price-value">{{ formatPrice(quote.bid, quote.digits) }}</span>
                </div>
                <div class="price ask" :class="getPriceClass(quote, 'ask')">
                  <span class="price-label">{{ t('quotes.ask') }}</span>
                  <span class="price-value">{{ formatPrice(quote.ask, quote.digits) }}</span>
                </div>
              </div>
              <div class="quote-footer">
                <span class="quote-time">{{ formatTime(quote.time) }}</span>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- Detail Panel -->
    <n-card v-if="selectedQuote" :title="selectedQuote.symbol" class="detail-card">
      <n-descriptions :column="4" label-placement="top">
        <n-descriptions-item :label="t('quotes.bid')">
          <span class="price-large">{{ formatPrice(selectedQuote.bid, selectedQuote.digits) }}</span>
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.ask')">
          <span class="price-large">{{ formatPrice(selectedQuote.ask, selectedQuote.digits) }}</span>
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.spread')">
          {{ selectedQuote.spread.toFixed(1) }} {{ t('quotes.points') }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.lastUpdate')">
          {{ formatTime(selectedQuote.time) }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.high')">
          {{ formatPrice(selectedQuote.high || 0, selectedQuote.digits) }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.low')">
          {{ formatPrice(selectedQuote.low || 0, selectedQuote.digits) }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.volume')">
          {{ selectedQuote.volume?.toLocaleString() || '-' }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('quotes.digits')">
          {{ selectedQuote.digits }}
        </n-descriptions-item>
      </n-descriptions>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NInput,
  NSwitch,
  NTabs,
  NTabPane,
  NTag,
  NDescriptions,
  NDescriptionsItem,
} from 'naive-ui'
import { tradingApi } from '@/api/trading'
import type { Quote } from '@/types'

const { t } = useI18n()

const searchSymbol = ref('')
const autoRefresh = ref(true)
const activeCategory = ref('all')
const selectedSymbol = ref<string | null>(null)
const previousPrices = ref<Map<string, { bid: number; ask: number }>>(new Map())
let refreshInterval: ReturnType<typeof setInterval> | null = null

const quotes = ref<Quote[]>([])

const filteredQuotes = computed(() => {
  if (!searchSymbol.value) return quotes.value
  return quotes.value.filter((q) =>
    q.symbol.toLowerCase().includes(searchSymbol.value.toLowerCase())
  )
})

const forexQuotes = computed(() =>
  filteredQuotes.value.filter((q) =>
    /^[A-Z]{6}$/.test(q.symbol) || q.symbol.includes('USD') || q.symbol.includes('EUR')
  )
)

const metalQuotes = computed(() =>
  filteredQuotes.value.filter((q) =>
    q.symbol.includes('XAU') || q.symbol.includes('XAG') || q.symbol.includes('GOLD')
  )
)

const cryptoQuotes = computed(() =>
  filteredQuotes.value.filter((q) =>
    q.symbol.includes('BTC') || q.symbol.includes('ETH') || q.symbol.includes('CRYPTO')
  )
)

const selectedQuote = computed(() => {
  if (!selectedSymbol.value) return null
  return quotes.value.find((q) => q.symbol === selectedSymbol.value) || null
})

const formatPrice = (price: number, digits: number) => {
  return price.toFixed(digits)
}

const formatTime = (time: string) => {
  return new Date(time).toLocaleTimeString()
}

const getSpreadType = (quote: Quote): 'success' | 'warning' | 'error' => {
  if (quote.spread < 2) return 'success'
  if (quote.spread < 5) return 'warning'
  return 'error'
}

const getPriceClass = (quote: Quote, type: 'bid' | 'ask') => {
  const prev = previousPrices.value.get(quote.symbol)
  if (!prev) return ''
  const currentPrice = type === 'bid' ? quote.bid : quote.ask
  const prevPrice = type === 'bid' ? prev.bid : prev.ask
  if (currentPrice > prevPrice) return 'price-up'
  if (currentPrice < prevPrice) return 'price-down'
  return ''
}

const selectSymbol = (quote: Quote) => {
  selectedSymbol.value = quote.symbol
}

const loadQuotes = async () => {
  // Store previous prices for comparison
  quotes.value.forEach((q) => {
    previousPrices.value.set(q.symbol, { bid: q.bid, ask: q.ask })
  })

  quotes.value = await tradingApi.getQuotes()

  // Clear price change indicators after animation
  setTimeout(() => {
    previousPrices.value.clear()
  }, 500)
}

const startAutoRefresh = () => {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(() => {
    if (autoRefresh.value) {
      loadQuotes()
    }
  }, 1000) // Refresh every 1 second for real-time quotes
}

onMounted(() => {
  loadQuotes()
  startAutoRefresh()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.quotes-card {
  margin-bottom: 16px;
}

.quotes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 8px 0;
}

.quote-card {
  padding: 12px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quote-card:hover {
  border-color: var(--primary-color);
}

.quote-card.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-color-suppl);
}

.quote-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.quote-symbol {
  font-weight: 600;
  font-size: 14px;
}

.quote-prices {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.price {
  flex: 1;
  text-align: center;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.price.bid {
  background-color: rgba(32, 128, 240, 0.1);
}

.price.ask {
  background-color: rgba(208, 48, 80, 0.1);
}

.price.price-up {
  animation: flash-green 0.5s ease;
}

.price.price-down {
  animation: flash-red 0.5s ease;
}

@keyframes flash-green {
  0%, 100% { background-color: inherit; }
  50% { background-color: rgba(24, 160, 88, 0.3); }
}

@keyframes flash-red {
  0%, 100% { background-color: inherit; }
  50% { background-color: rgba(208, 48, 80, 0.3); }
}

.price-label {
  display: block;
  font-size: 10px;
  color: var(--text-color-secondary);
  margin-bottom: 2px;
}

.price-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bid .price-value {
  color: var(--buy-color);
}

.ask .price-value {
  color: var(--sell-color);
}

.quote-footer {
  text-align: right;
}

.quote-time {
  font-size: 10px;
  color: var(--text-color-secondary);
}

.detail-card {
  margin-top: 16px;
}

.price-large {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
