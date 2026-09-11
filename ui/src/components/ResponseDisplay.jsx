import StateBadge from './StateBadge.jsx'
import CitationChip from './CitationChip.jsx'
import { Gauge } from 'lucide-react'
import clsx from 'clsx'

export default function ResponseDisplay({ response, onCitationClick }) {
  const { state, answer, citations = [], contradiction_explanation, confidence_score, question } = response

  return (
    <div className="animate-slide-up space-y-4">
      {/* Question echo */}
      <div className="text-xs text-slate-500 italic border-l-2 border-surface-500 pl-3">
        Q: {question}
      </div>

      {/* State card */}
      {state === 'answerable' && (
        <AnswerableCard
          answer={answer}
          citations={citations}
          confidence={confidence_score}
          onCitationClick={onCitationClick}
        />
      )}
      {state === 'near_miss' && (
        <NearMissCard answer={answer} confidence={confidence_score} />
      )}
      {state === 'contradiction' && (
        <ContradictionCard
          answer={answer}
          citations={citations}
          explanation={contradiction_explanation}
          confidence={confidence_score}
          onCitationClick={onCitationClick}
        />
      )}
    </div>
  )
}

/* ── Confidence indicator ─────────────────────────────────────── */
function ConfidenceBar({ score }) {
  const pct = Math.round(score * 100)
  const color = pct >= 85 ? 'bg-accent-green' : pct >= 65 ? 'bg-accent-amber' : 'bg-accent-red'
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <Gauge className="w-3 h-3" />
      <span>Confidence {pct}%</span>
      <div className="flex-1 h-1 bg-surface-400 rounded-full overflow-hidden max-w-20">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ── Answerable ───────────────────────────────────────────────── */
function AnswerableCard({ answer, citations, confidence, onCitationClick }) {
  return (
    <div className="rounded-xl border-l-4 border-accent-green bg-surface-200 p-5 glow-green">
      <div className="flex items-start justify-between gap-3 mb-3">
        <StateBadge state="answerable" />
        <ConfidenceBar score={confidence} />
      </div>
      <p className="text-sm leading-relaxed text-slate-200">{answer}</p>

      {citations.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Citations
          </p>
          {citations.map((c, i) => (
            <CitationChip key={i} citation={c} onClick={onCitationClick} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Near-miss ────────────────────────────────────────────────── */
function NearMissCard({ answer, confidence }) {
  return (
    <div className="rounded-xl border-l-4 border-slate-500 bg-surface-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <StateBadge state="near_miss" />
        <ConfidenceBar score={confidence} />
      </div>
      <div className="bg-slate-800/50 border border-slate-600/30 rounded-lg p-4">
        <p className="text-sm text-slate-300 leading-relaxed">{answer}</p>
      </div>
      <p className="mt-2 text-[10px] text-slate-600 italic">
        The rulebook is silent on this topic. No inference or guessing performed.
      </p>
    </div>
  )
}

/* ── Contradiction ────────────────────────────────────────────── */
function ContradictionCard({ answer, citations, explanation, confidence, onCitationClick }) {
  const clauseA = citations[0]
  const clauseB = citations[1]

  return (
    <div className="rounded-xl border-l-4 border-accent-red bg-surface-200 p-5 glow-red">
      <div className="flex items-start justify-between gap-3 mb-3">
        <StateBadge state="contradiction" />
        <ConfidenceBar score={confidence} />
      </div>

      <p className="text-sm leading-relaxed text-slate-200 mb-4">{answer}</p>

      {/* Side-by-side clause comparison */}
      {clauseA && clauseB && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <ClausePanel label="Clause A" citation={clauseA} color="red" onClick={onCitationClick} />
          <ClausePanel label="Clause B" citation={clauseB} color="red" onClick={onCitationClick} />
        </div>
      )}

      {/* Extra citations if any */}
      {citations.length > 2 && (
        <div className="space-y-2 mb-4">
          {citations.slice(2).map((c, i) => (
            <CitationChip key={i} citation={c} onClick={onCitationClick} />
          ))}
        </div>
      )}

      {explanation && (
        <div className="bg-accent-red/5 border border-accent-red/20 rounded-lg p-4">
          <p className="text-[10px] font-semibold text-accent-red uppercase tracking-widest mb-1">
            Conflict Explanation
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{explanation}</p>
        </div>
      )}
    </div>
  )
}

function ClausePanel({ label, citation, color, onClick }) {
  return (
    <button
      onClick={() => onClick(citation.source, citation.location, citation.quote)}
      className="text-left border-2 border-accent-red/30 hover:border-accent-red/60 rounded-lg p-3 bg-accent-red/5 hover:bg-accent-red/10 transition-all duration-200"
    >
      <p className="text-[10px] font-bold text-accent-red uppercase tracking-widest mb-0.5">
        {label}
      </p>
      <p className="text-[11px] text-slate-400 mb-1">
        {citation.source} — {citation.location}
      </p>
      <p className="text-xs italic text-slate-300 leading-relaxed line-clamp-4">
        &ldquo;{citation.quote}&rdquo;
      </p>
    </button>
  )
}
