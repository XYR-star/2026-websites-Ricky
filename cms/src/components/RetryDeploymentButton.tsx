'use client'

import { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

export function RetryDeploymentButton() {
  const { id, data } = useDocumentInfo()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  useEffect(() => { setAccepted(false); setInFlight(false); setMessage('') }, [id])
  if (!id) return null
  if (data?.status === 'requested' || accepted) return <p role="status">Vercel 已接收此记录的部署请求，请查看构建结果。</p>
  const retry = async () => {
    setBusy(true)
    setMessage('正在请求网站更新…')
    try {
      const response = await fetch(`/api/deployments/${encodeURIComponent(id)}/retry`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CMS-Request': '1' }, body: '{}',
      })
      const result = await response.json() as { error?: string; message?: string; status?: string }
      if (result.status === 'requested') setAccepted(true)
      if (result.status === 'in-flight') setInFlight(true)
      setMessage(response.ok ? result.message || '请求已发送，请刷新发布记录。' : result.error || '请求失败，内容仍保留。')
    } catch { setMessage('暂时无法连接后台，内容仍保留。') }
    finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <button type="button" disabled={busy || inFlight} onClick={retry} className="btn btn--style-secondary btn--size-small">{busy || inFlight ? '正在请求…' : '重试网站更新'}</button>
    <span role="status" aria-live="polite">{message}</span>
  </div>
}
