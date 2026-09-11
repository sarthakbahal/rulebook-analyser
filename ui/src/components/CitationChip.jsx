import { useState } from 'react'
import { FileText, MapPin, ChevronDown, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

export default function CitationChip({ citation, onClick }) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = () => {
    setExpanded(!expanded)
    onClick(citation.source, citation.location, citation.quote)
  }

  return (
    <div className="bg-surface-300 rounded-lg border border-surface-400 overflow-hidden transition-all duration-200 hover:border-accent-blue/40">
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-400 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="flex items-center gap-1 text-accent-blue text-xs font-medium shrink-0">
            <FileText className="w-3 h-3" />
            {citation.source}
          </span>
          <span className="flex items-center gap-1 text-slate-400 text-xs shrink-0">
            <MapPin className="w-3 h-3" />
            {citation.location}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="text-[10px] text-accent-blue/60 hidden sm:block">
            View in doc
          </span>
          <ExternalLink className="w-3 h-3 text-accent-blue/40" />
          <ChevronDown
            className={clsx(
              'w-3 h-3 text-slate-500 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-400 animate-fade-in">
          <p className="mt-2 text-xs italic text-slate-300 leading-relaxed bg-surface-200 rounded px-3 py-2 border border-surface-400">
            &ldquo;{citation.quote}&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}
