import { useRef, useState } from 'react'
import { parseCartPdf } from '../engine/pdfParser.js'

export default function PdfCartUploader({ onLoad }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | error

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    setStatus('loading')

    try {
      const { data, skippedRows, error } = await parseCartPdf(file)

      if (error) {
        setStatus('error')
        onLoad([], [error])
        return
      }

      setStatus('idle')
      onLoad(data, skippedRows, file.name)
    } catch (err) {
      console.error('PDF parse error:', err)
      setStatus('error')
      onLoad([], ['Could not read this PDF. Please check the file is not corrupted.'])
    }

    e.target.value = ''
  }

  return (
    <div style={{ marginTop: '0.6rem' }}>
      <div
        style={{
          border: '1px dashed #CECECE',
          borderRadius: 6,
          padding: '0.6rem 0.9rem',
          background: '#fafafa',
          cursor: 'pointer',
          fontSize: 12,
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <span style={{ color: '#FF5800', fontWeight: 700 }}>
          {status === 'loading' ? 'Reading PDF…' : 'Or upload cart as PDF'}
        </span>
      </div>
    </div>
  )
}