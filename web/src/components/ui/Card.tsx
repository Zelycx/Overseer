import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  padding?: 'small' | 'medium' | 'large'
}

export default function Card({ children, padding = 'medium', className = '', ...props }: CardProps) {
  return <section className={`card card--${padding} ${className}`.trim()} {...props}>{children}</section>
}
