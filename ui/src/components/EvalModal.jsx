import { useState, useEffect } from 'react'
import { X, BarChart3, Loader2, TrendingUp, CheckCircle, MinusCircle, AlertTriangle } from 'lucide-react'
import { runEval } from '../lib/api.js'
import clsx from 'clsx'

export default function EvalModal({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  // Elapsed timer for the long-running eval
  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    runEval()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-fade-in">
      <div className="bg-surface-100 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-surface-400 shadow-2xl flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-400 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center border border-accent-blue/30">
              <BarChart3 className="w-4 h-4 text-accent-blue" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Evaluation Benchmark</h2>
              <p className="text-[11px] text-slate-500">43-question test set · 3-state classification</p>
            </div>
          </div>
          <button
            id="eval-close-btn"
            onClick={onClose}
            className="p-2 hover:bg-surface-300 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Loader2 className="w-10 h-10 text-accent-blue animate-spin" />
              <div>
                <p className="text-white font-medium">Running 43-question benchmark…</p>
                <p className="text-slate-500 text-sm mt-1">
                  This may take a few minutes. Elapsed: <span className="text-accent-blue font-mono">{fmtTime(elapsed)}</span>
                </p>
              </div>
              <div className="dot-blink mt-2">
                <span /><span /><span />
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="text-accent-red text-sm bg-accent-red/10 border border-accent-red/20 rounded-lg px-5 py-4 max-w-md text-center">
                ⚠ Benchmark failed: {error}
              </p>
              <button onClick={onClose} className="text-xs text-slate-500 hover:text-white transition-colors">
                Close
              </button>
            </div>
          )}

          {data && (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <MetricCard
                  label="Overall"
                  icon={<TrendingUp className="w-4 h-4" />}
                  correct={data.metrics.overall.correct}
                  total={data.metrics.overall.total}
                  accentClass="text-accent-blue border-accent-blue/20 bg-accent-blue/5"
                  barClass="bg-accent-blue"
                />
                <MetricCard
                  label="Answerable"
                  icon={<CheckCircle className="w-4 h-4" />}
                  correct={data.metrics.answerable.correct}
                  total={data.metrics.answerable.total}
                  accentClass="text-accent-green border-accent-green/20 bg-accent-green/5"
                  barClass="bg-accent-green"
                />
                <MetricCard
                  label="Near-Miss"
                  icon={<MinusCircle className="w-4 h-4" />}
                  correct={data.metrics.near_miss.correct}
                  total={data.metrics.near_miss.total}
                  accentClass="text-slate-400 border-slate-500/20 bg-slate-500/5"
                  barClass="bg-slate-400"
                />
                <MetricCard
                  label="Contradiction"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  correct={data.metrics.contradiction.correct}
                  total={data.metrics.contradiction.total}
                  accentClass="text-accent-red border-accent-red/20 bg-accent-red/5"
                  barClass="bg-accent-red"
                />
              </div>

              {/* Results table */}
              <div className="border border-surface-400 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-300 border-b border-surface-400">
                      <th className="px-4 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-widest font-semibold">ID</th>
                      <th className="px-4 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Question</th>
                      <th className="px-4 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-widest font-semibold hidden sm:table-cell">Expected</th>
                      <th className="px-4 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-widest font-semibold hidden sm:table-cell">Predicted</th>
                      <th className="px-4 py-2.5 text-center text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r, i) => (
                      <tr
                        key={r.id}
                        className={clsx(
                          'border-t border-surface-400 transition-colors',
                          i % 2 === 0 ? 'bg-surface-200' : 'bg-surface-100',
                          'hover:bg-surface-300',
                        )}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.id}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300 max-w-xs">
                          <span className="line-clamp-2">{r.question}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs hidden sm:table-cell">
                          <TypeBadge type={r.type} />
                        </td>
                        <td className="px-4 py-2.5 text-xs hidden sm:table-cell">
                          <TypeBadge type={r.predicted_state} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={clsx(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold',
                              r.match
                                ? 'bg-accent-green/20 text-accent-green'
                                : 'bg-accent-red/20 text-accent-red',
                            )}
                          >
                            {r.match ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────── */

function MetricCard({ label, icon, correct, total, accentClass, barClass }) {
  const pct = total > 0 ? (correct / total) * 100 : 0
  return (
    <div className={clsx('rounded-xl border p-4', accentClass)}>
      <div className={clsx('flex items-center gap-2 mb-2', accentClass.split(' ')[0])}>
        {icon}
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">
        {correct}<span className="text-slate-500 text-base font-normal">/{total}</span>
      </p>
      <div className="mt-2 h-1.5 bg-surface-400 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs opacity-70">{pct.toFixed(1)}%</p>
    </div>
  )
}

function TypeBadge({ type }) {
  const styles = {
    answerable:   'bg-accent-green/10 text-accent-green',
    near_miss:    'bg-slate-500/10 text-slate-400',
    contradiction:'bg-accent-red/10 text-accent-red',
  }
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium', styles[type] ?? '')}>
      {type}
    </span>
  )
}
