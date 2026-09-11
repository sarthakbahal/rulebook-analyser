import { useState } from 'react'
import { Send, Loader2, Zap } from 'lucide-react'
import { queryEngine } from '../lib/api.js'
import ResponseDisplay from './ResponseDisplay.jsx'
import clsx from 'clsx'

const PRESETS = [
  {
    label: '🔴 Contradiction',
    question: 'What is the minimum attendance required if I am hospitalized?',
    color: 'border-accent-red/30 text-accent-red hover:bg-accent-red/10',
  },
  {
    label: '⚪ Near-miss',
    question: 'What is the policy if I miss an exam because my sibling is getting married?',
    color: 'border-slate-500/30 text-slate-400 hover:bg-slate-500/10',
  },
  {
    label: '🟢 Answerable',
    question: 'What is plagiarism under MIT guidelines?',
    color: 'border-accent-green/30 text-accent-green hover:bg-accent-green/10',
  },
  {
    label: '🔴 Contradiction 2',
    question: 'What penalty applies to a first late hostel entry after 10:00 PM?',
    color: 'border-accent-red/30 text-accent-red hover:bg-accent-red/10',
  },
  {
    label: '🔴 Contradiction 3',
    question: 'How long after graduation can I claim the library caution deposit refund?',
    color: 'border-accent-red/30 text-accent-red hover:bg-accent-red/10',
  },
]

export default function QueryPanel({ response, onResponse, onCitationClick }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (question) => {
    const q = question ?? input
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await queryEngine(q.trim())
      onResponse({ question: q.trim(), ...result })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="w-[55%] flex flex-col border-r border-surface-400 overflow-hidden">
      {/* Preset quick-start buttons */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-400 shrink-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Quick Presets
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setInput(p.question)
                handleSubmit(p.question)
              }}
              disabled={loading}
              className={clsx(
                'px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all duration-150 disabled:opacity-40',
                p.color,
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-b border-surface-400 shrink-0">
        <div className="flex gap-2">
          <textarea
            id="query-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the academic regulations…"
            className="flex-1 bg-surface-300 border border-surface-400 focus:border-accent-blue/50 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-blue/20 transition-all text-slate-200 placeholder-slate-600"
            rows={2}
          />
          <button
            id="query-submit-btn"
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="px-4 bg-accent-blue hover:bg-accent-blue/80 disabled:bg-surface-400 disabled:text-slate-600 rounded-lg transition-all duration-200 text-white flex items-center justify-center min-w-[48px] active:scale-95"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded px-3 py-2">
            ⚠ {error}
          </p>
        )}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="px-4 py-3 border-b border-surface-400 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="dot-blink">
              <span /><span /><span />
            </div>
            <span>Retrieving context &amp; classifying…</span>
          </div>
        </div>
      )}

      {/* Response area */}
      <div className="flex-1 overflow-y-auto p-4">
        {!response && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-300 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Ask anything about the rulebook</p>
              <p className="text-xs mt-1">Try a preset above or type your own question</p>
            </div>
          </div>
        )}
        {response && (
          <ResponseDisplay
            response={response}
            onCitationClick={onCitationClick}
          />
        )}
      </div>
    </div>
  )
}
