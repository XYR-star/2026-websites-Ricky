'use client'

import { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type Result = { state: string; message: string; checkedAt?: string }

export function ContentVerification() {
  const { id } = useDocumentInfo()
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!id) return
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0
    const controller = new AbortController()
    setResult(null)
    const check = async () => {
      setBusy(true)
      try {
        const response = await fetch(`/api/deployments/${encodeURIComponent(id)}/check`, {
          method: 'POST', credentials: 'same-origin', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-CMS-Request': '1' }, body: '{}',
        })
        const data = await response.json()
        if (disposed) return
        if (!response.ok) throw new Error('Unable to check')
        setResult(data)
        if (data.state === 'different' && ++attempts < 12) timer = setTimeout(check, 10_000)
      } catch {
        if (!disposed) setResult({ state: 'check-failed', message: '暂时无法检查网站内容，发布记录仍保留。' })
      } finally { if (!disposed) setBusy(false) }
    }
    void check()
    return () => { disposed = true; controller.abort(); if (timer) clearTimeout(timer) }
  }, [id, refresh])
  if (!id) return null
  return <section style={{ marginBlock: 16 }} aria-label="正式站内容核验">
    <p role="status" aria-live="polite">{result?.message || '正在核对正式站内容…'}</p>
    {result?.checkedAt && <p>上次检查：{new Date(result.checkedAt).toLocaleString('zh-CN')}</p>}
    <button type="button" className="btn btn--style-secondary btn--size-small" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? '正在检查…' : '重新检查网站内容'}</button>
  </section>
}
