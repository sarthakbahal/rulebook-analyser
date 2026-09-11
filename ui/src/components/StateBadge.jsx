import { CheckCircle, MinusCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

const CONFIG = {
  answerable: {
    label: 'STATE 1 · ANSWERABLE',
    Icon: CheckCircle,
    pill: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  },
  near_miss: {
    label: 'STATE 2 · OUT OF SCOPE',
    Icon: MinusCircle,
    pill: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  },
  contradiction: {
    label: 'STATE 3 · CONTRADICTION',
    Icon: AlertTriangle,
    pill: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  },
}

export default function StateBadge({ state }) {
  const cfg = CONFIG[state] ?? CONFIG.near_miss
  const { Icon } = cfg
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider',
        cfg.pill,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </div>
  )
}
