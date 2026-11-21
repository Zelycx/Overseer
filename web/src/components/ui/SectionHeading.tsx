import type { ReactNode } from 'react'

type SectionHeadingProps = {
  title: string
  detail?: string
  action?: ReactNode
  className?: string
}

export default function SectionHeading({ title, detail, action, className = '' }: SectionHeadingProps) {
  return (
    <div className={`section-heading ${className}`.trim()}>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  )
}
