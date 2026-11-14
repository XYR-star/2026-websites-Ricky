'use client'

import { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

export function RetryDeploymentButton() {
  const { id } = useDocumentInfo()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!id) return null
  const retry = async () => {
    setBusy(true)
    setMessage('正在请求网站更新…')
    try {
      const response = await fetch(`/api/deployments/${encodeURIComponent(id)}/retry`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CMS-Request': '1' }, body: '{}',
      })
      const result = await response.json() as { error?: string; message?: string }
      setMessage(response.ok ? result.message || '请求已发送，请刷新发布记录。' : result.error || '请求失败，内容仍保留。')
    } catch { setMessage('暂时无法连接后台，内容仍保留。') }
    finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <button type="button" disabled={busy} onClick={retry} className="btn btn--style-secondary btn--size-small">{busy ? '正在请求…' : '重试网站更新'}</button>
    <span role="status" aria-live="polite">{message}</span>
  </div>
}
