import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ReceiptDownloadButton from "@/components/ReceiptDownloadButton";

export interface ReceiptRecord {
  orderId: string;
  customerName: string;
  contact: string;
  amount: number;
  status: string;
  date: string;
}

const normalize = (value: string) => value.toLocaleLowerCase("fr").trim();

const ReceiptHistory = ({ records }: { records: ReceiptRecord[] }) => {
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");

  const filtered = useMemo(() => {
    const term = normalize(search);
    return records.filter((record) => {
      const matchesText = !term || [record.orderId, record.customerName, record.contact]
        .some((value) => normalize(value).includes(term));
      const matchesDate = !date || record.date.slice(0, 10) === date;
      return matchesText && matchesDate;
    });
  }, [date, records, search]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="text-base">Historique des reçus</CardTitle>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, n° de commande ou contact"
              className="pl-9"
              aria-label="Filtrer les reçus"
            />
          </div>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Filtrer les reçus par date"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left py-2 px-3">Commande</th>
              <th className="text-left py-2 px-3">Client</th>
              <th className="text-left py-2 px-3">Contact</th>
              <th className="text-left py-2 px-3">Montant</th>
              <th className="text-left py-2 px-3">Date</th>
              <th className="text-right py-2 px-3">Reçu</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.orderId} className="border-t border-border">
                <td className="py-2 px-3 font-mono text-xs">{record.orderId.slice(0, 8).toUpperCase()}</td>
                <td className="py-2 px-3">{record.customerName || "Client Scoly"}</td>
                <td className="py-2 px-3">{record.contact || "—"}</td>
                <td className="py-2 px-3 whitespace-nowrap">{record.amount.toLocaleString("fr-FR")} FCFA</td>
                <td className="py-2 px-3 text-muted-foreground">{new Date(record.date).toLocaleDateString("fr-FR")}</td>
                <td className="py-2 px-3 text-right">
                  {record.status === "completed" || record.status === "confirmed" || record.status === "shipped" || record.status === "delivered" ? (
                    <ReceiptDownloadButton orderId={record.orderId} iconOnly />
                  ) : (
                    <Badge variant="secondary">En attente</Badge>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Aucun reçu trouvé</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default ReceiptHistory;