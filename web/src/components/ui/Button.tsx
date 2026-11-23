import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'outline' | 'lime'

type SharedProps = {
  variant?: ButtonVariant
  size?: 'small' | 'medium' | 'large'
  children: ReactNode
  className?: string
}

type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement>
type ButtonLinkProps = SharedProps & LinkProps

function classes(variant: ButtonVariant, size: ButtonProps['size'], className = '') {
  return `button button--${variant} button--${size ?? 'medium'} ${className}`.trim()
}

export function Button({ variant = 'primary', size = 'medium', className, ...props }: ButtonProps) {
  return <button className={classes(variant, size, className)} {...props} />
}

export function ButtonLink({ variant = 'primary', size = 'medium', className, ...props }: ButtonLinkProps) {
  return <Link className={classes(variant, size, className)} {...props} />
}
