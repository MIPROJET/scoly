import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DataPaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

/**
 * Composant de pagination réutilisable pour les listes de l'admin.
 * Fonctionne aussi bien avec la pagination côté serveur (via `.range()`)
 * qu'avec la pagination côté client sur des données déjà chargées.
 */
const DataPagination = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: DataPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  if (total === 0) return null;

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, safePage - 1);
    const end = Math.min(totalPages, safePage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 w-full max-w-full min-w-0 flex-wrap ${className || ""}`}
    >
      <p className="text-xs text-muted-foreground order-2 sm:order-1 shrink-0">
        {from}-{to} sur {total}
      </p>

      <Pagination className="order-1 sm:order-2 mx-0 w-auto">
        <PaginationContent className="flex-wrap">
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              aria-label="Page précédente"
            >
              <ChevronLeft size={16} />
            </Button>
          </PaginationItem>
          {getPageNumbers()[0] > 1 && (
            <PaginationItem className="hidden sm:block">
              <span className="px-2 text-muted-foreground text-sm">…</span>
            </PaginationItem>
          )}
          {getPageNumbers().map((p) => (
            <PaginationItem key={p} className="hidden sm:block">
              <PaginationLink
                href="#"
                isActive={p === safePage}
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(p);
                }}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem className="sm:hidden">
            <span className="px-2 text-sm text-muted-foreground whitespace-nowrap">
              {safePage} / {totalPages}
            </span>
          </PaginationItem>
          {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
            <PaginationItem className="hidden sm:block">
              <span className="px-2 text-muted-foreground text-sm">…</span>
            </PaginationItem>
          )}
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              aria-label="Page suivante"
            >
              <ChevronRight size={16} />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {onPageSizeChange && (
        <div className="order-3 flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Par page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export default DataPagination;
