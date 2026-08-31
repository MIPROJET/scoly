import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REGIONS } from "@/lib/ivoryCities";

interface RegionComboboxProps {
  value: string;
  onChange: (region: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

/** Combobox recherchable des régions, saisie libre autorisée (valeur auto-remplie modifiable). */
const RegionCombobox = ({
  value,
  onChange,
  placeholder = "Rechercher une région…",
  className,
  id,
}: RegionComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return REGIONS;
    return REGIONS.filter((r) => norm(r).includes(q));
  }, [query]);

  const select = (region: string) => {
    onChange(region);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Map className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Tapez le nom de la région…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {query.trim() ? (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-sm text-left hover:bg-accent"
                  onClick={() => select(query.trim())}
                >
                  Utiliser « {query.trim()} »
                </button>
              ) : (
                "Aucune région trouvée."
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((region) => (
                <CommandItem key={region} value={region} onSelect={() => select(region)}>
                  <Check
                    className={cn("mr-2 h-4 w-4", value === region ? "opacity-100" : "opacity-0")}
                  />
                  {region}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default RegionCombobox;
