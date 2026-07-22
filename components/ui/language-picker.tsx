'use client'

import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LANGUAGES } from '@/lib/presets'

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
  const current = LANGUAGES.find((lang) => lang.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-36 justify-between font-normal"
        >
          <span className="truncate">{current?.name ?? value}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search languages…" />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {LANGUAGES.map((lang) => (
                <CommandItem
                  key={lang.id}
                  value={`${lang.name} ${lang.id} ${(lang.aliases ?? []).join(' ')}`}
                  data-checked={lang.id === value}
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
