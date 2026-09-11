import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Loader2, Search } from 'lucide-react'
import { getDocument } from '../lib/api.js'
import clsx from 'clsx'

const TABS = [
  { id: 'academic_handbook.pdf', label: 'Academic Handbook', short: 'Handbook' },
  { id: 'hostel_rules.md',       label: 'Hostel Rules',      short: 'Hostel'   },
  { id: 'fee_deadlines.md',      label: 'Fee Deadlines',     short: 'Fees'     },
  { id: 'contradictions.md',     label: 'Contradictions',    short: 'Conflicts' },
]

export default function DocumentInspector({ activeDoc, highlight, onTabChange }) {
  const [docText, setDocText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const viewerRef = useRef(null)
  const highlightRef = useRef(null)

  // Fetch document text when active tab changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    getDocument(activeDoc)
      .then(data => setDocText(data.text || ''))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeDoc])

  // Scroll to & highlight citation when it changes
  useEffect(() => {
    if (!highlight || !viewerRef.current || loading) return

    // Switch to the correct tab first
    if (highlight.source && highlight.source !== activeDoc) {
      onTabChange(highlight.source)
      return  // effect will re-run after tab switch
    }

    // After text is loaded, find and scroll to the highlighted passage
    requestAnimationFrame(() => {
      if (!viewerRef.current) return
      const el = viewerRef.current

      // Try to find the location keyword or verbatim quote in the text
      const searchTerms = [
        highlight.location,
        highlight.quote?.slice(0, 40),
      ].filter(Boolean)

      const fullText = el.textContent || ''
      let foundIdx = -1
      for (const term of searchTerms) {
        const idx = fullText.indexOf(term)
        if (idx !== -1) { foundIdx = idx; break }
      }

      if (foundIdx !== -1) {
        const ratio = foundIdx / fullText.length
        el.scrollTop = ratio * el.scrollHeight - el.clientHeight / 2
      }
    })
  }, [highlight, docText, loading, activeDoc, onTabChange])

  // Render text with highlighted quote
  const renderText = useCallback(() => {
    if (!highlight || !highlight.quote || highlight.source !== activeDoc) {
      return <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400 leading-relaxed">{docText}</pre>
    }

    const q = highlight.quote.slice(0, 80)
    const idx = docText.indexOf(q)
    if (idx === -1) {
      return <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400 leading-relaxed">{docText}</pre>
    }

    return (
      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400 leading-relaxed">
        {docText.slice(0, idx)}
        <mark className="highlight-active bg-accent-blue/20 text-accent-blue rounded">
          {docText.slice(idx, idx + q.length)}
        </mark>
        {docText.slice(idx + q.length)}
      </pre>
    )
  }, [docText, highlight, activeDoc])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-surface-400 bg-surface-100 shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`doc-tab-${tab.id.replace('.', '-')}`}
            onClick={() => onTabChange(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-all duration-200 border-b-2',
              activeDoc === tab.id
                ? 'text-accent-blue border-accent-blue bg-surface-200'
                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-surface-300',
            )}
          >
            <FileText className="w-3 h-3" />
            <span className="hidden md:inline">{tab.label}</span>
            <span className="md:hidden">{tab.short}</span>
          </button>
        ))}
      </div>

      {/* Citation context banner */}
      {highlight && highlight.source === activeDoc && (
        <div className="px-4 py-2 bg-accent-blue/5 border-b border-accent-blue/20 text-xs text-accent-blue flex items-center gap-2 shrink-0 animate-fade-in">
          <Search className="w-3 h-3" />
          Highlighted: <strong>{highlight.location}</strong>
        </div>
      )}

      {/* Document viewer */}
      <div
        ref={viewerRef}
        className="flex-1 overflow-y-auto p-5 bg-surface-200"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading document…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-accent-red text-xs bg-accent-red/10 border border-accent-red/20 rounded px-4 py-3">
              ⚠ {error}
            </p>
          </div>
        ) : (
          renderText()
        )}
      </div>
    </div>
  )
}
