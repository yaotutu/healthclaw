<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ChannelTabs from '../components/ChannelTabs.vue'
import BindForm from '../components/BindForm.vue'
import WechatQRLogin from '../components/WechatQRLogin.vue'

/** 可用渠道列表（从后端 API 获取） */
const channels = ref<any[]>([])
/** 当前选中的渠道 */
const selectedChannel = ref<any>(null)
/** 加载状态 */
const loading = ref(false)
/** 错误信息 */
const error = ref('')

const emit = defineEmits<{
  'bind-success': [userId: string]
}>()

/**
 * 页面加载时获取可用渠道列表
 */
onMounted(async () => {
  try {
    const res = await fetch('/api/channels')
    const data = await res.json()
    channels.value = data.channels || []
    // 默认选中第一个已启用的渠道
    const firstEnabled = channels.value.find((c: any) => c.enabled)
    if (firstEnabled) {
      selectedChannel.value = firstEnabled
    }
  } catch (err) {
    error.value = '无法连接到服务器'
  }
})

/**
 * 切换渠道选择
 */
const onSelectChannel = (channel: any) => {
  if (!channel.enabled) return
  selectedChannel.value = channel
  error.value = ''
}

/**
 * 提交绑定（表单渠道）
 */
const onBind = async (credentials: Record<string, string>) => {
  if (!selectedChannel.value) return
  loading.value = true
  error.value = ''

  try {
    const res = await fetch('/api/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: selectedChannel.value.type,
        credentials,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      error.value = data.error || '绑定失败'
      return
    }

    emit('bind-success', data.userId)
  } catch (err) {
    error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}

/**
 * 微信 QR 扫码绑定成功
 */
const onWechatBindSuccess = (userId: string) => {
  emit('bind-success', userId)
}
</script>

<template>
  <div class="login-page">
    <div class="page">
      <!-- 标题区域 -->
      <div class="logo">OHA</div>
      <div class="subtitle">选择渠道，开启你的专属健康顾问</div>

      <!-- 渠道选项卡 -->
      <ChannelTabs
        :channels="channels"
        :selected="selectedChannel?.type"
        @select="onSelectChannel"
      />

      <!-- 微信 QR 扫码绑定 -->
      <WechatQRLogin
        v-if="selectedChannel?.type === 'wechat'"
        :loading="loading"
        :error="error"
        @bind-success="onWechatBindSuccess"
      />

      <!-- 标准表单绑定 -->
      <BindForm
        v-else-if="selectedChannel"
        :channel="selectedChannel"
        :loading="loading"
        :error="error"
        @submit="onBind"
      />
    </div>
  </div>
</template>

<style scoped>
.login-page {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  background: #fbfbfd;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}

.page {
  width: 100%;
  max-width: 520px;
  padding: 0 40px;
  text-align: center;
}

.logo {
  font-size: 28px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.5px;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 14px;
  color: #86868b;
  font-weight: 400;
  margin-bottom: 32px;
}
</style>
