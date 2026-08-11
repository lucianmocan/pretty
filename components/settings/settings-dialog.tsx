'use client'

import { useState, type ReactNode } from 'react'
import { Code2, ExternalLink, HardDrive, MessageSquare, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NumericPresetControl } from '@/components/ui/numeric-preset-control'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import packageJson from '@/package.json'
import {
  setAppTheme,
  setMotionPreference,
  setUiDensity,
  useAppTheme,
  useMotionPreference,
  useUiDensity,
  type AppTheme,
  type MotionPreference,
  type UiDensity,
} from '@/lib/app-preferences'
import {
  MAX_TAB_SIZE,
  MIN_TAB_SIZE,
  setAutoIndent,
  setTabSize,
  TAB_SIZE_OPTIONS,
  useAutoIndent,
  useTabSize,
} from '@/lib/editor-preferences'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsGroup = 'editor' | 'appearance' | 'shortcuts' | 'about'

interface ShortcutItem {
  label: string
  keys: string[]
  suffix?: string
}

type ShortcutGroup = 'history' | 'canvas' | 'editor'

const SHORTCUT_GROUPS: Array<{ id: ShortcutGroup; title: string; items: ShortcutItem[] }> = [
  {
    id: 'history',
    title: 'History & selection',
    items: [
      { label: 'Undo', keys: ['⌘ / Ctrl', 'Z'] },
      { label: 'Redo', keys: ['⌘ / Ctrl', 'Shift', 'Z'] },
      { label: 'Select sibling layers', keys: ['⌘ / Ctrl', 'A'] },
      { label: 'Duplicate selection', keys: ['⌘ / Ctrl', 'D'] },
      { label: 'Delete selection', keys: ['Delete / Backspace'] },
      { label: 'Edit selected text or code', keys: ['Enter'] },
      { label: 'Cancel or select canvas', keys: ['Esc'] },
    ],
  },
  {
    id: 'canvas',
    title: 'Canvas',
    items: [
      { label: 'Pan canvas', keys: ['Space'], suffix: '+ drag' },
      { label: 'Zoom in', keys: ['⌘ / Ctrl', '+'] },
      { label: 'Zoom out', keys: ['⌘ / Ctrl', '−'] },
      { label: 'Reset zoom', keys: ['⌘ / Ctrl', '0'] },
      { label: 'Nudge selection 1 px', keys: ['Arrow keys'] },
      { label: 'Nudge selection 10 px', keys: ['Shift', 'Arrow keys'] },
    ],
  },
  {
    id: 'editor',
    title: 'Code editor',
    items: [
      { label: 'Indent', keys: ['Tab'] },
      { label: 'Outdent', keys: ['Shift', 'Tab'] },
      { label: 'Remove previous tab stop', keys: ['Backspace'] },
      { label: 'Next search result', keys: ['Enter'] },
      { label: 'Close search', keys: ['Esc'] },
    ],
  },
]

function SettingsRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-3 border-t py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Label>{label}</Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-end sm:self-auto">{children}</div>
    </div>
  )
}

function Choice({
  value,
  children,
  ariaLabel,
  className,
}: {
  value: string
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <ToggleGroupItem value={value} aria-label={ariaLabel} className={className}>
      {children}
    </ToggleGroupItem>
  )
}

function ShortcutKeys({ keys, suffix }: Pick<ShortcutItem, 'keys' | 'suffix'>) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="contents">
          {index > 0 && <span aria-hidden="true">+</span>}
          <kbd className="scripture-keycap">{key}</kbd>
        </span>
      ))}
      {suffix && <span>{suffix}</span>}
    </span>
  )
}

function ShortcutSection({ title, items }: { title: string; items: ShortcutItem[] }) {
  return (
    <section aria-label={title}>
      <div className="mb-3">
        <Label>{title}</Label>
        <p className="mt-1 text-xs text-muted-foreground">Keyboard commands available in this area.</p>
      </div>
      <div>
        {items.map((item) => (
          <div key={item.label} className="flex min-h-9 items-center justify-between gap-6 border-t py-1.5 first:border-t-0">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <ShortcutKeys keys={item.keys} suffix={item.suffix} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Global preferences shared by the dashboard and every document editor. */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const tabSize = useTabSize()
  const autoIndent = useAutoIndent()
  const theme = useAppTheme()
  const density = useUiDensity()
  const motion = useMotionPreference()
  const [group, setGroup] = useState<SettingsGroup>('editor')
  const [shortcutGroup, setShortcutGroup] = useState<ShortcutGroup>('history')
  const activeShortcutGroup = SHORTCUT_GROUPS.find((item) => item.id === shortcutGroup) ?? SHORTCUT_GROUPS[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:h-[38rem] sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure Pretty across all of your documents.</DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full justify-start overflow-x-auto"
          value={group}
          onValueChange={(value) => value && setGroup(value as SettingsGroup)}
          aria-label="Settings category"
        >
          <Choice value="editor" className="min-w-20 flex-1">Editor</Choice>
          <Choice value="appearance" className="min-w-24 flex-1">Appearance</Choice>
          <Choice value="shortcuts" className="min-w-24 flex-1">Shortcuts</Choice>
          <Choice value="about" className="min-w-20 flex-1">About</Choice>
        </ToggleGroup>

        <Separator />

        <div className="-mr-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
          <section aria-label="Editor settings" style={{ display: group === 'editor' ? 'block' : 'none' }}>
          <SettingsRow label="Indent size" description="Choose how many spaces Tab inserts and Backspace removes at each indentation stop.">
            <NumericPresetControl
              value={tabSize}
              options={TAB_SIZE_OPTIONS}
              min={MIN_TAB_SIZE}
              max={MAX_TAB_SIZE}
              unit="spaces"
              ariaLabel="Indent size"
              onChange={setTabSize}
            />
          </SettingsRow>

          <SettingsRow label="Automatic indentation" description="Carry indentation forward and indent after an opening bracket.">
            <Switch checked={autoIndent} onCheckedChange={setAutoIndent} aria-label="Automatic indentation" />
          </SettingsRow>

          </section>

          <section aria-label="Appearance settings" style={{ display: group === 'appearance' ? 'block' : 'none' }}>
          <SettingsRow label="Color theme" description="Choose how the application interface looks.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={theme} onValueChange={(value) => value && setAppTheme(value as AppTheme)} aria-label="Color theme">
              <Choice value="dark">Dark</Choice><Choice value="light">Light</Choice><Choice value="system">System</Choice>
            </ToggleGroup>
          </SettingsRow>

          <SettingsRow label="Interface density" description="Compact mode fits more controls and workspace on screen.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={density} onValueChange={(value) => value && setUiDensity(value as UiDensity)} aria-label="Interface density">
              <Choice value="comfortable">Comfortable</Choice><Choice value="compact">Compact</Choice>
            </ToggleGroup>
          </SettingsRow>

          <SettingsRow label="Motion" description="Follow the system preference or override interface animation.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={motion} onValueChange={(value) => value && setMotionPreference(value as MotionPreference)} aria-label="Motion preference">
              <Choice value="system">System</Choice><Choice value="full">Full</Choice><Choice value="reduced">Reduced</Choice>
            </ToggleGroup>
          </SettingsRow>
          </section>

          <section
            aria-label="Keyboard shortcuts"
            className={group === 'shortcuts'
              ? 'min-h-full sm:grid sm:grid-cols-[10.5rem_minmax(0,1fr)]'
              : 'hidden'}
          >
            <nav
              className="flex gap-1 overflow-x-auto border-b pb-3 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0"
              aria-label="Shortcut groups"
            >
              {SHORTCUT_GROUPS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={shortcutGroup === item.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="shrink-0 justify-start"
                  aria-pressed={shortcutGroup === item.id}
                  onClick={() => setShortcutGroup(item.id)}
                >
                  {item.title}
                </Button>
              ))}
            </nav>
            <div className="pt-4 sm:pt-0 sm:pl-4">
              <ShortcutSection title={activeShortcutGroup.title} items={activeShortcutGroup.items} />
            </div>
          </section>

          <section aria-label="About" style={{ display: group === 'about' ? 'block' : 'none' }}>
          <SettingsRow label="Feedback" description="Share an idea, report a problem, or follow the project.">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/lucianmocan/scripture/issues/new" target="_blank" rel="noopener noreferrer"><MessageSquare />Send feedback<ExternalLink /></a>
            </Button>
          </SettingsRow>

          <SettingsRow label="Source" description="View the project and its latest changes on GitHub.">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/lucianmocan/scripture" target="_blank" rel="noopener noreferrer"><Code2 />Open GitHub<ExternalLink /></a>
            </Button>
          </SettingsRow>

          <SettingsRow label="Licenses" description="Review third-party software notices and license terms.">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/lucianmocan/scripture/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener noreferrer"><Scale />Third-party licenses<ExternalLink /></a>
            </Button>
          </SettingsRow>

          <SettingsRow label="Storage" description="Documents and preferences stay in this browser unless you export them.">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3.5" />Local-first</span>
          </SettingsRow>

          <SettingsRow label="Version" description="The currently installed Pretty release.">
            <span className="text-xs text-muted-foreground">v{packageJson.version}</span>
          </SettingsRow>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
