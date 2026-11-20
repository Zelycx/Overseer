import type { HTMLAttributes, ReactNode } from 'react'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: 'neutral' | 'lime' | 'blue' | 'amber' | 'soft'
}

export default function Badge({ children, tone = 'neutral', className = '', ...props }: BadgeProps) {
  return <span className={`badge badge--${tone} ${className}`.trim()} {...props}>{children}</span>
}
