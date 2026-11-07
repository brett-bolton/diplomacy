"use client"

// Small shared UI pieces.

import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-text border-transparent hover:opacity-90",
    secondary: "bg-surface text-text border-line-strong hover:bg-surface-2",
    ghost: "bg-transparent text-text border-transparent hover:bg-surface-2",
    danger: "bg-danger text-white border-transparent hover:opacity-90 dark:text-black",
  }
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  )
}

export function Card({ children, className = "", tone = "default" }: { children: ReactNode; className?: string; tone?: "default" | "success" }) {
  const toneCls = tone === "success" ? "border-success bg-success-soft" : "border-line bg-surface"
  return <div className={`rounded-2xl border transition-colors ${toneCls} ${className}`}>{children}</div>
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warning" | "danger" | "success" }) {
  const tones = {
    neutral: "bg-surface-2 text-text-2",
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}

/** A bottom sheet / modal that lives in normal flow on top of everything. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="safe-bottom max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-text-2 hover:bg-surface-2" aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Choice({
  children,
  onClick,
  selected,
  hint,
}: {
  children: ReactNode
  onClick: () => void
  selected?: boolean
  hint?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition ${
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
      }`}
    >
      <span className="text-[15px]">{children}</span>
      {hint ? <span className="shrink-0 text-xs text-text-3">{hint}</span> : null}
    </button>
  )
}
