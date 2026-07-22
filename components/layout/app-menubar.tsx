'use client'

import Link from 'next/link'
import { Home } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from '@/components/ui/menubar'

interface AppMenubarProps {
  docName: string
  onRename: (name: string) => void
  onAddPage: () => void
  onExportPdf: () => void
  onExportPng: () => void
  exporting: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onOpenCustomize: () => void
  /** Right-aligned slot for route-specific controls (e.g. search/replace). */
  children?: ReactNode
}

export function AppMenubar({
  docName,
  onRename,
  onAddPage,
  onExportPdf,
  onExportPng,
  exporting,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpenCustomize,
  children,
}: AppMenubarProps) {
  return (
    <div className="scripture-app-menubar">
      <Link href="/" className="scripture-home-link" aria-label="Back to documents" title="Back to documents">
        <Home size={16} />
      </Link>

      <Menubar className="border-0 bg-transparent p-0 h-auto gap-0.5 shadow-none">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAddPage}>Add page</MenubarItem>
            <MenubarSeparator />
            <MenubarItem asChild>
              <Link href="/">Back to Documents</Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onZoomIn}>Zoom in</MenubarItem>
            <MenubarItem onClick={onZoomOut}>Zoom out</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onZoomReset}>Zoom to 100%</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Export</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onExportPdf} disabled={exporting}>
              Export PDF
            </MenubarItem>
            <MenubarItem onClick={onExportPng} disabled={exporting}>
              Export PNG
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Customize</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onOpenCustomize}>Open customize window…</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <Input
        className="h-7 w-56 border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
        value={docName}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Untitled"
      />

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}
