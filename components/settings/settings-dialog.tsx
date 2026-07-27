'use client'

import { useState, type ReactNode } from 'react'
import { Code2, ExternalLink, HardDrive, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import packageJson from '@/package.json'
import {
  EXPORT_MARGIN_OPTIONS,
  setAppTheme,
  setExportFormat,
  setExportMargin,
  setExportQuality,
  setMotionPreference,
  setTransparentExport,
  setUiDensity,
  useAppTheme,
  useExportFormat,
  useExportMargin,
  useExportQuality,
  useMotionPreference,
  useTransparentExport,
  useUiDensity,
  type AppTheme,
  type ExportFormat,
  type ExportMargin,
  type ExportQuality,
  type MotionPreference,
  type UiDensity,
} from '@/lib/app-preferences'
import {
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

type SettingsGroup = 'editor' | 'appearance' | 'shortcuts' | 'export' | 'about'

interface ShortcutItem {
  label: string
  keys: string[]
  suffix?: string
}

const SHORTCUT_GROUPS: Array<{ title: string; items: ShortcutItem[] }> = [
  {
    title: 'History and selection',
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
    title: 'Canvas navigation',
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
    title: 'Code editor and search',
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
    <section className="border-t pt-4 first:border-t-0 first:pt-0" aria-label={title}>
      <Label>{title}</Label>
      <div className="mt-2">
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
  const exportFormat = useExportFormat()
  const exportQuality = useExportQuality()
  const exportMargin = useExportMargin()
  const transparentExport = useTransparentExport()
  const [group, setGroup] = useState<SettingsGroup>('editor')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:h-[52rem] sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl">
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
          <Choice value="export" className="min-w-20 flex-1">Export</Choice>
          <Choice value="about" className="min-w-20 flex-1">About</Choice>
        </ToggleGroup>

        <Separator />

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          <section aria-label="Editor settings" style={{ display: group === 'editor' ? 'block' : 'none' }}>
          <SettingsRow label="Indent size" description="Spaces inserted by Tab and removed to the previous tab stop.">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={String(tabSize)}
              onValueChange={(value) => value && setTabSize(Number(value))}
              aria-label="Indent size"
            >
              {TAB_SIZE_OPTIONS.map((size) => <Choice key={size} value={String(size)} ariaLabel={`${size} spaces`}>{size}</Choice>)}
            </ToggleGroup>
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
            className="space-y-4"
            style={{ display: group === 'shortcuts' ? 'block' : 'none' }}
          >
            {SHORTCUT_GROUPS.map((shortcutGroup) => (
              <ShortcutSection key={shortcutGroup.title} {...shortcutGroup} />
            ))}
          </section>

          <section aria-label="Export settings" style={{ display: group === 'export' ? 'block' : 'none' }}>
          <SettingsRow label="Preferred format" description="Marks the format you use most often as the primary export action.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={exportFormat} onValueChange={(value) => value && setExportFormat(value as ExportFormat)} aria-label="Preferred export format">
              <Choice value="pdf">PDF</Choice><Choice value="png">PNG</Choice>
            </ToggleGroup>
          </SettingsRow>

          <SettingsRow label="Raster quality" description="Higher quality produces sharper PNGs and PDFs with larger files.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={exportQuality} onValueChange={(value) => value && setExportQuality(value as ExportQuality)} aria-label="Export raster quality">
              <Choice value="standard">Standard</Choice><Choice value="high">High</Choice><Choice value="maximum">Maximum</Choice>
            </ToggleGroup>
          </SettingsRow>

          <SettingsRow label="Margin" description="Transparent space around the exported canvas, measured in pixels.">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={String(exportMargin)} onValueChange={(value) => value && setExportMargin(Number(value) as ExportMargin)} aria-label="Export margin">
              {EXPORT_MARGIN_OPTIONS.map((margin) => <Choice key={margin} value={String(margin)} ariaLabel={`${margin} pixel margin`}>{margin}</Choice>)}
            </ToggleGroup>
          </SettingsRow>

          <SettingsRow label="Transparent background" description="Keep the area around the canvas transparent instead of filling it.">
            <Switch checked={transparentExport} onCheckedChange={setTransparentExport} aria-label="Transparent export background" />
          </SettingsRow>
          </section>

          <section aria-label="About" style={{ display: group === 'about' ? 'block' : 'none' }}>
          <SettingsRow label="Feedback" description="Share an idea, report a problem, or follow the project.">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/lucianmocan/pretty/issues/new" target="_blank" rel="noopener noreferrer"><MessageSquare />Send feedback<ExternalLink /></a>
            </Button>
          </SettingsRow>

          <SettingsRow label="Source" description="View the project and its latest changes on GitHub.">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/lucianmocan/pretty" target="_blank" rel="noopener noreferrer"><Code2 />Open GitHub<ExternalLink /></a>
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
