'use client'

import Link from 'next/link'
import { Check, Home, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'

interface AppMenubarProps {
  docName: string
  onRename: (name: string) => void
  saveState: 'saving' | 'saved'
  /** Right-aligned slot for route-specific controls (e.g. search/replace). */
  children?: ReactNode
}

export function AppMenubar({
  docName,
  onRename,
  saveState,
  children,
}: AppMenubarProps) {
  return (
    <div className="scripture-app-menubar">
      <Link href="/" className="scripture-home-link" aria-label="Back to documents" title="Back to documents">
        <Home size={16} />
      </Link>

      <Input
        className="h-7 w-56 border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
        value={docName}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Untitled"
      />

      <span className="scripture-save-status" role="status" aria-live="polite">
        {saveState === 'saving' ? (
          <>
            <LoaderCircle className="scripture-save-status-spinner" />
            Saving…
          </>
        ) : (
          <>
            <Check />
            Saved locally
          </>
        )}
      </span>

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}
