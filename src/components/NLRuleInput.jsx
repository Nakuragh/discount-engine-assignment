import { useState } from 'react'

export default function NLRuleInput({ onConfirmRule }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle')
  const [parsed, setParsed] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit() {
    if (!text.trim()) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/parse-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()

      if (!res.ok || data.resolvable === false) {
        setErrorMsg(data.clarificationNeeded || data.error || 'Could not parse that rule.')
        setStatus('error')
        return
      }

      setParsed(data)
      setStatus('confirming')
    } catch {
      setErrorMsg('Network error — could not reach the parser.')
      setStatus('error')
    }
  }

  function handleConfirm() {
    onConfirmRule(parsed)
    reset()
  }

  function handleDiscard() {
    reset()
  }

  function reset() {
    setText('')
    setParsed(null)
    setStatus('idle')
    setErrorMsg('')
  }

  return (
    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#131A48', marginBottom: 6 }}>
        Add a rule in plain English
      </div>

      {status !== 'confirming' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "20% off Natura Casa, stackable with other offers"'
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #CECECE', borderRadius: 4, fontSize: 13 }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            onClick={handleSubmit}
            disabled={status === 'loading' || !text.trim()}
            style={{
              background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
              padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {status === 'loading' ? 'Parsing…' : 'Add Rule'}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#b00020' }}>{errorMsg}</div>
      )}

      {status === 'confirming' && parsed && (
        <div style={{ border: '1px solid #1e5c2c', background: '#f0faf2', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e5c2c', marginBottom: 8 }}>
            Confirm this rule
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: '#131A48' }}>
            <div><b>Scope:</b> {parsed.scope}</div>
            {parsed.scope !== 'cart' && <div><b>Applies to:</b> {parsed.appliesTo}</div>}
            <div><b>Type:</b> {parsed.type}</div>
            <div><b>Value:</b> {parsed.type === 'percentage' ? `${parsed.value}%` : `Rs.${parsed.value}`}</div>
            <div><b>Stackable:</b> {parsed.stackable ? 'Yes' : 'No'}</div>
            {parsed.scope === 'cart' && <div><b>Min cart value:</b> Rs.{parsed.minCartValue}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleConfirm} style={{ background: '#1e5c2c', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Confirm
            </button>
            <button onClick={handleDiscard} style={{ background: '#fff', color: '#888', border: '1px solid #CECECE', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}