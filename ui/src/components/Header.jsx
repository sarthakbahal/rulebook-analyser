import { BookOpen, PlayCircle, Activity } from 'lucide-react'

export default function Header({ onOpenEval }) {
  return (
    <header className="h-16 bg-surface-100 border-b border-surface-400 flex items-center justify-between px-6 shrink-0 z-10">
      {/* Left: brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center border border-accent-blue/30">
          <BookOpen className="w-4 h-4 text-accent-blue" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-none text-white">
            Rulebook Engine
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-none">
            Academic Regulation &amp; Contradiction Inspector
          </p>
        </div>
      </div>

      {/* Right: status + eval button */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
          <Activity className="w-3.5 h-3.5 text-accent-green" />
          <span>3-state classifier · Groq LLaMA-3.3-70B</span>
        </div>
        <button
          id="run-eval-btn"
          onClick={onOpenEval}
          className="flex items-center gap-2 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/30 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-accent-blue/10 active:scale-95"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Run Eval Benchmark
          <span className="hidden md:inline ml-1 opacity-60">(25 queries)</span>
        </button>
      </div>
    </header>
  )
}
