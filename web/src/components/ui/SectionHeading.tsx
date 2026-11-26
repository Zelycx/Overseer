import type { ReactNode } from 'react'

type SectionHeadingProps = {
  title: string
  detail?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export default function SectionHeading({
  title,
  detail,
  icon,
  action,
  className = ''
}: SectionHeadingProps) {
  return (
    <div className={`section-heading ${className}`.trim()}>
      <div className="section-heading__main">
        {icon && (
          <span className="section-heading__icon">
            {icon}
          </span>
        )}

        <div className="section-heading__text">
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
      </div>

      {action && (
        <div className="section-heading__action">
          {action}
        </div>
      )}
    </div>
  )
}