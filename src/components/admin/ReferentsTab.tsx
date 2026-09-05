import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Wallet,
  ShoppingBag,
  History,
  CalendarRange,
  RefreshCw,
  School,
} from "lucide-react";

interface ReferentRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  school_name: string | null;
  city: string | null;
  zone_name: string | null;
  orders_count: number;
  orders_amount: number;
  referrals_count: number;
  total_earned: number;
  total_withdrawn: number;
  available_balance: number;
  last_activity_at: string | null;
}

interface ReferentOrder {
  id: string;
  reference: string;
  total_amount: number;
  status: string | null;
  payment_method: string | null;
  created_at: string;
  is_own: boolean;
}

interface ReferentActivity {
  type: string;
  label: string;
  amount: number | null;
  created_at: string;
}

const fcfa = (v: number | null | undefined) =>
  `${Number(v || 0).toLocaleString("fr-FR")} FCFA`;

const dt = (v: string | null | undefined) =>
  v && v !== "-infinity"
    ? new Date(v).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  shipped: "default",
  delivered: "default",
  cancelled: "destructive",
};

const ACTIVITY_LABEL: Record<string, string> = {
  audit: "Action",
  referral: "Parrainage",
  reward: "Récompense",
  withdrawal: "Retrait",
  commission: "Commission",
};

const isoStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const isoEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : null);

/** Onglet admin : un onglet par référent, avec commandes, solde et activités. */
const ReferentsTab = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const range = useMemo(() => ({ from: isoStart(from), to: isoEnd(to) }), [from, to]);

  const {
    data: referents = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["referents-overview", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referents_overview", {
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      return (data || []) as unknown as ReferentRow[];
    },
    staleTime: 60_000,
  });

  const activeId = selected ?? referents[0]?.user_id ?? null;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["referent-detail", activeId, range.from, range.to],
    enabled: !!activeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referent_detail", {
        _referent_id: activeId as string,
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      const payload = (data || {}) as { orders?: ReferentOrder[]; activities?: ReferentActivity[] };
      return {
        orders: payload.orders || [],
        activities: payload.activities || [],
      };
    },
  });

  const totals = useMemo(
    () =>
      referents.reduce(
        (acc, r) => ({
          orders: acc.orders + Number(r.orders_count || 0),
          amount: acc.amount + Number(r.orders_amount || 0),
          balance: acc.balance + Number(r.available_balance || 0),
        }),
        { orders: 0, amount: 0, balance: 0 },
      ),
    [referents],
  );


  return (
    <div className="space-y-4">
      {/* Filtre par date */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            Suivi des référents
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="grid gap-1.5">
            <Label htmlFor="ref-from" className="text-xs">Du</Label>
            <Input
              id="ref-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ref-to" className="text-xs">Au</Label>
            <Input
              id="ref-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>
              Tout l'historique
            </Button>
            <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totaux */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Référents</p>
          <p className="text-2xl font-bold">{referents.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Commandes</p>
          <p className="text-2xl font-bold">{totals.orders}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
          <p className="text-lg font-bold">{fcfa(totals.amount)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Soldes disponibles</p>
          <p className="text-lg font-bold">{fcfa(totals.balance)}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : referents.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Aucun référent enregistré pour le moment.
        </CardContent></Card>
      ) : (
        <Tabs value={activeId ?? undefined} onValueChange={setSelected} className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="flex w-max flex-nowrap">
              {referents.map((r) => (
                <TabsTrigger key={r.user_id} value={r.user_id} className="gap-2 whitespace-nowrap">
                  <Users size={14} />
                  {r.full_name || r.email || "Référent"}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {referents.map((r) => (
            <TabsContent key={r.user_id} value={r.user_id} className="space-y-4">
              {/* Identité */}
              <Card>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Référent</p>
                    <p className="font-semibold">{r.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.email || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Établissement</p>
                    <p className="flex items-center gap-1 font-medium">
                      <School size={14} className="text-primary" />
                      {r.school_name || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.city || r.zone_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Inscrit le</p>
                    <p className="font-medium">{dt(r.created_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      Dernière activité : {dt(r.last_activity_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Parrainages</p>
                    <p className="text-2xl font-bold">{r.referrals_count}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Solde */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card><CardContent className="p-4">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShoppingBag size={12} /> Commandes
                  </p>
                  <p className="text-2xl font-bold">{r.orders_count}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Montant généré</p>
                  <p className="text-lg font-bold">{fcfa(r.orders_amount)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Gains / Retraits</p>
                  <p className="text-sm font-semibold">{fcfa(r.total_earned)}</p>
                  <p className="text-xs text-muted-foreground">retiré : {fcfa(r.total_withdrawn)}</p>
                </CardContent></Card>
                <Card className="border-primary/40"><CardContent className="p-4">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Wallet size={12} /> Solde disponible
                  </p>
                  <p className="text-lg font-bold text-primary">{fcfa(r.available_balance)}</p>
                </CardContent></Card>
              </div>

              {/* Commandes + activités */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      Commandes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto p-0">
                    {detailLoading ? (
                      <div className="space-y-2 p-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : (detail?.orders.length ?? 0) === 0 ? (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        Aucune commande sur la période choisie.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {detail?.orders.map((o) => (
                            <tr key={o.id} className="border-b last:border-0">
                              <td className="p-3">
                                <p className="font-mono text-xs font-semibold">#{o.reference}</p>
                                <p className="text-xs text-muted-foreground">{dt(o.created_at)}</p>
                              </td>
                              <td className="p-3">
                                <Badge variant={STATUS_VARIANT[o.status || "pending"] || "secondary"}>
                                  {o.status || "—"}
                                </Badge>
                                {!o.is_own && (
                                  <p className="mt-1 text-[11px] text-muted-foreground">parrainage</p>
                                )}
                              </td>
                              <td className="p-3 text-right font-semibold">{fcfa(o.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4 text-primary" />
                      Historique d'activités
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto p-0">
                    {detailLoading ? (
                      <div className="space-y-2 p-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : (detail?.activities.length ?? 0) === 0 ? (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        Aucune activité sur la période choisie.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {detail?.activities.map((a, i) => (
                          <li key={`${a.type}-${i}`} className="flex items-start justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <Badge variant="outline" className="mb-1 text-[11px]">
                                {ACTIVITY_LABEL[a.type] || a.type}
                              </Badge>
                              <p className="truncate text-sm">{a.label}</p>
                              <p className="text-xs text-muted-foreground">{dt(a.created_at)}</p>
                            </div>
                            {a.amount != null && (
                              <span className="whitespace-nowrap text-sm font-semibold">
                                {fcfa(a.amount)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

    </div>
  );
};

export default ReferentsTab;
