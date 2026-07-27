'use client'

import Link from 'next/link'
import { Check, ChevronRight, Home, LoaderCircle, Settings2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { Button } from '@/components/ui/button'
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
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <div className="scripture-app-menubar">
        <div className="scripture-document-identity">
          <Link href="/dashboard" className="scripture-home-link" aria-label="Back to workspace" title="Back to workspace">
            <Home size={16} />
          </Link>

          <ChevronRight className="scripture-document-breadcrumb" aria-hidden="true" />

          <Input
            className="scripture-document-title-input h-7 border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
            value={docName}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Untitled"
            aria-label="Document name"
          />

          <span
            className="scripture-save-status"
            role="status"
            aria-live="polite"
            title={saveState === 'saved' ? 'Saved locally in this browser' : undefined}
          >
            {saveState === 'saving' ? (
              <>
                <LoaderCircle className="scripture-save-status-spinner" />
                Saving…
              </>
            ) : (
              <>
                <Check />
                Saved
              </>
            )}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {children}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
            Settings
          </Button>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
