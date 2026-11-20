type ProgressBarProps = {
  value: number
  label?: string
  tone?: 'lime' | 'navy' | 'blue'
}

export default function ProgressBar({ value, label, tone = 'lime' }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value))
  return (
    <div className="progress-bar-wrap">
      <div
        className={`progress-bar progress-bar--${tone}`}
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}
