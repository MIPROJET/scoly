import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO,
  findCountryByIso,
  findCountryByPhone,
  searchCountries,
  toE164,
  type Country,
} from "@/lib/countries";

interface PhoneInputProps {
  /** Numéro au format international E.164 (ex. +2250700000000). */
  value: string;
  onChange: (e164: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-invalid"?: boolean;
}

/**
 * Saisie de téléphone internationale : sélecteur de pays recherchable
 * (nom, nom anglais, indicatif ou code ISO) + numéro local.
 * La valeur remontée est toujours normalisée en E.164.
 */
const PhoneInput = ({
  value,
  onChange,
  id,
  className,
  placeholder = "07 00 00 00 00",
  disabled,
  required,
  ...rest
}: PhoneInputProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<Country>(
    () => findCountryByPhone(value) ?? findCountryByIso(DEFAULT_COUNTRY_ISO)!,
  );
  const [local, setLocal] = useState(() =>
    value ? value.replace(findCountryByPhone(value)?.dial ?? "", "") : "",
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Synchronise si la valeur change depuis l'extérieur (édition, reset…).
  useEffect(() => {
    const detected = findCountryByPhone(value);
    if (detected && detected.dial !== country.dial) {
      setCountry(detected);
      setLocal(value.replace(detected.dial, ""));
    } else if (!value) {
      setLocal("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = useMemo(() => searchCountries(query), [query]);

  const selectCountry = (c: Country) => {
    setCountry(c);
    setOpen(false);
    setQuery("");
    onChange(local ? toE164(c.dial, local) : c.dial);
  };

  const handleLocal = (raw: string) => {
    const cleaned = raw.replace(/[^\d\s.-]/g, "");
    setLocal(cleaned);
    onChange(cleaned.replace(/\D/g, "") ? toE164(country.dial, cleaned) : "");
  };

  return (
    <div className={cn("flex w-full gap-2", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setTimeout(() => searchRef.current?.focus(), 30);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Choisir l'indicatif du pays"
            aria-expanded={open}
            disabled={disabled}
            className="h-11 shrink-0 gap-1 rounded-xl px-2 font-normal sm:px-3"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span className="text-sm tabular-nums">{country.dial}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pays, indicatif ou code (CI, +225…)"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandList className="max-h-72">
              <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => (
                  <CommandItem
                    key={c.iso}
                    value={c.iso}
                    onSelect={() => selectCountry(c)}
                    className="gap-2"
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.dial}</span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        c.iso === country.iso ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="relative flex-1">
        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={local}
          disabled={disabled}
          required={required}
          onChange={(e) => handleLocal(e.target.value)}
          placeholder={placeholder}
          className="h-11 rounded-xl pl-9"
          {...rest}
        />
      </div>
    </div>
  );
};

export default PhoneInput;
