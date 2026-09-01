import { useEffect, useState, useCallback } from "react";
import {
  Globe,
  Users,
  Eye,
  MapPin,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

type Period = "7" | "30" | "90";

interface DailyVisit {
  date: string;
  visits: number;
}

interface TopEntry {
  label: string;
  count: number;
}

interface TrafficOverview {
  total_visits: number;
  unique_visitors: number;
  countries_count: number;
  daily_visits: DailyVisit[];
  top_pages: TopEntry[];
  top_countries: TopEntry[];
  top_devices: TopEntry[];
}

const EMPTY_OVERVIEW: TrafficOverview = {
  total_visits: 0,
  unique_visitors: 0,
  countries_count: 0,
  daily_visits: [],
  top_pages: [],
  top_countries: [],
  top_devices: [],
};

// Normalise le JSON renvoyé par la fonction SQL get_traffic_overview,
// en tolérant des variantes de clés (snake_case ou camelCase).
const normalizeOverview = (raw: any): TrafficOverview => {
  if (!raw || typeof raw !== "object") return EMPTY_OVERVIEW;

  const pickArray = (...keys: string[]) => {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    return [];
  };

  const mapEntries = (arr: any[], labelKeys: string[], countKeys: string[]): TopEntry[] =>
    arr.map((item) => {
      const label =
        labelKeys.map((k) => item?.[k]).find((v) => v !== undefined && v !== null) ?? "—";
      const count =
        countKeys.map((k) => item?.[k]).find((v) => v !== undefined && v !== null) ?? 0;
      return { label: String(label), count: Number(count) };
    });

  const dailyRaw = pickArray("daily_visits", "dailyVisits", "by_day", "visits_by_day");
  const daily: DailyVisit[] = dailyRaw.map((item: any) => ({
    date: item.date ?? item.day ?? item.created_at ?? "",
    visits: Number(item.visits ?? item.count ?? item.total ?? 0),
  }));

  return {
    total_visits: Number(raw.total_visits ?? raw.totalVisits ?? raw.visits ?? 0),
    unique_visitors: Number(raw.unique_visitors ?? raw.uniqueVisitors ?? raw.visitors ?? 0),
    countries_count: Number(raw.countries_count ?? raw.countriesCount ?? raw.countries ?? 0),
    daily_visits: daily,
    top_pages: mapEntries(pickArray("top_pages", "topPages"), ["path", "page", "label"], ["count", "visits"]),
    top_countries: mapEntries(
      pickArray("top_countries", "topCountries"),
      ["country_name", "country", "label"],
      ["count", "visits"]
    ),
    top_devices: mapEntries(
      pickArray("top_devices", "topDevices"),
      ["device_type", "device", "label"],
      ["count", "visits"]
    ),
  };
};

const TrafficTab = () => {
  const [period, setPeriod] = useState<Period>("30");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrafficOverview>(EMPTY_OVERVIEW);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    const { data: rpcData, error } = await supabase.rpc("get_traffic_overview", {
      _days: Number(period),
    });
    if (error) {
      console.error("get_traffic_overview error:", error);
      setData(EMPTY_OVERVIEW);
    } else {
      setData(normalizeOverview(rpcData));
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const isEmpty =
    !loading &&
    data.total_visits === 0 &&
    data.daily_visits.length === 0 &&
    data.top_pages.length === 0;

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-foreground">Trafic</h1>
          <p className="text-muted-foreground text-sm">
            Visites du site et géolocalisation des visiteurs
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="h-10 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="shrink-0" onClick={fetchOverview} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Aucune donnée de trafic pour cette période.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cartes d'indicateurs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 sm:p-6 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <Eye size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visites</p>
                  <p className="text-2xl font-bold break-words">{data.total_visits.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 shrink-0">
                  <Users size={20} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visiteurs uniques</p>
                  <p className="text-2xl font-bold break-words">{data.unique_visitors.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
                  <MapPin size={20} className="text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Pays</p>
                  <p className="text-2xl font-bold break-words">{data.countries_count.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Courbe des visites par jour */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Visites par jour</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-2 sm:px-6">
              {data.daily_visits.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={260} minWidth={0}>
                  <LineChart data={data.daily_visits}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="visits"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--primary))", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Barres top pays / top pages / appareils */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MapPin size={16} /> Top pays
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden">
                {data.top_countries.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220} minWidth={0}>
                    <BarChart data={data.top_countries} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="label"
                        type="category"
                        width={90}
                        fontSize={11}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe size={16} /> Top pages
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden">
                {data.top_pages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ul className="space-y-2">
                    {data.top_pages.slice(0, 8).map((p, i) => (
                      <li
                        key={`${p.label}-${i}`}
                        className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0"
                      >
                        <span className="truncate min-w-0" title={p.label}>{p.label}</span>
                        <span className="shrink-0 font-medium text-primary">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Smartphone size={16} /> Appareils
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden">
                {data.top_devices.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220} minWidth={0}>
                    <BarChart data={data.top_devices}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default TrafficTab;
