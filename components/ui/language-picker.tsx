'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LANGUAGES } from '@/lib/presets'
import { rankLanguageSearch } from '@/lib/language-search'

interface LanguagePickerProps {
  value: string
  onChange: (id: string) => void
}

/** Searchable combobox over Shiki's full ~235-language bundled list --
 * a plain <select> stops being usable at that count, so this replaces it
 * with the same Popover+Command pattern shadcn's own combobox example uses.
 * Search matches name, id, AND aliases (e.g. typing "ts" finds TypeScript). */
export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((lang) => lang.id === value)

  // cmdk preserves the list element's scrollTop while it filters. With a
  // long language list that leaves the first/best result above the visible
  // viewport after typing. Wait until the filtered items have committed,
  // then return the viewport to the top for every query.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = 0
    })
    return () => cancelAnimationFrame(frame)
  }, [open, search])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          size="sm"
          aria-expanded={open}
          className="w-36 justify-between font-normal"
        >
          <span className="truncate">{current?.name ?? value}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        {/* text-xs on the input/items -- PopoverContent renders through a
            portal (see components/ui/popover.tsx), outside the Inspector's
            own DOM subtree, so the .scripture-inspector-scoped font-size
            normalization (app/globals.css) can't reach it; Command's own
            defaults are text-sm (14px), noticeably bigger than the rest of
            the Inspector's 12px scale. */}
        <Command
          filter={(id, query, keywords) =>
            rankLanguageSearch(id, keywords?.[0] ?? id, keywords?.slice(1), query)
          }
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search languages…"
            className="text-xs"
          />
          <CommandList ref={listRef}>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {LANGUAGES.map((lang) => (
                <CommandItem
                  key={lang.id}
                  value={lang.id}
                  keywords={[lang.name, ...(lang.aliases ?? [])]}
                  data-checked={lang.id === value}
                  className="text-xs"
                  onSelect={() => {
                    onChange(lang.id)
                    setOpen(false)
                  }}
                >
                  {lang.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
