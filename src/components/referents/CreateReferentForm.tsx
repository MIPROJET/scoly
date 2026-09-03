import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type SchoolRow = { id: string; name: string; city: string | null };
type ZoneRow = { id: string; name: string };
type ProfileRow = { id: string; first_name: string | null; last_name: string | null; email: string | null };

const CreateReferentForm = () => {
  const [mode, setMode] = useState<"new_user" | "existing_user">("new_user");
  const [saving, setSaving] = useState(false);

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [schoolMode, setSchoolMode] = useState<"existing" | "new">("new");
  const [schoolId, setSchoolId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [userId, setUserId] = useState("");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    school_name: "",
    school_type: "secondary",
    city: "",
    region: "",
    address: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: z }, { data: p }] = await Promise.all([
        supabase.from("schools").select("id,name,city").order("name").limit(500),
        supabase.from("zones").select("id,name").eq("is_active", true).order("name").limit(500),
        supabase.from("profiles").select("id,first_name,last_name,email").order("created_at", { ascending: false }).limit(300),
      ]);
      setSchools(s || []);
      setZones(z || []);
      setProfiles(p || []);
    })();
  }, []);

  const submit = async () => {
    if (schoolMode === "existing" && !schoolId) return toast.error("Sélectionnez un établissement");
    if (schoolMode === "new" && !form.school_name.trim()) return toast.error("Nom de l'établissement requis");
    if (mode === "existing_user" && !userId) return toast.error("Sélectionnez un utilisateur");
    if (mode === "new_user" && (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim()))
      return toast.error("Nom, prénom et email requis");

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-referent", {
        body: {
          mode,
          user_id: mode === "existing_user" ? userId : undefined,
          zone_id: zoneId || undefined,
          school_id: schoolMode === "existing" ? schoolId : undefined,
          ...(schoolMode === "new"
            ? {
                school_name: form.school_name,
                school_type: form.school_type,
                city: form.city,
                region: form.region,
                address: form.address,
              }
            : {}),
          first_name: form.first_name,
          last_name: form.last_name,
          email: mode === "new_user" ? form.email : undefined,
          phone: form.phone,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Référent créé avec succès");
      setForm({
        first_name: "", last_name: "", email: "", phone: "",
        school_name: "", school_type: "secondary", city: "", region: "", address: "",
      });
      setSchoolId(""); setUserId(""); setZoneId("");
    } catch (e: any) {
      toast.error(e?.message || "Échec de la création du référent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus size={18} /> Créer un référent
        </CardTitle>
        <CardDescription>
          Créez directement un établissement et son gérant, ou rattachez un utilisateur existant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Établissement */}
        <Tabs value={schoolMode} onValueChange={(v) => setSchoolMode(v as any)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="new">Nouvel établissement</TabsTrigger>
            <TabsTrigger value="existing">Établissement existant</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="grid gap-4 sm:grid-cols-2 pt-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nom de l'établissement *</Label>
              <Input value={form.school_name} onChange={(e) => set("school_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.school_type} onValueChange={(v) => set("school_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primaire</SelectItem>
                  <SelectItem value="secondary">Secondaire</SelectItem>
                  <SelectItem value="university">Université</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Région</Label>
              <Input value={form.region} onChange={(e) => set("region", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Adresse</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </TabsContent>
          <TabsContent value="existing" className="pt-4">
            <div className="space-y-2">
              <Label>Établissement *</Label>
              <Select value={schoolId} onValueChange={setSchoolId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.city ? ` — ${s.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        {/* Gérant */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="new_user">Nouveau gérant</TabsTrigger>
            <TabsTrigger value="existing_user">Utilisateur existant</TabsTrigger>
          </TabsList>
          <TabsContent value="new_user" className="grid gap-4 sm:grid-cols-2 pt-4">
            <div className="space-y-2">
              <Label>Prénom *</Label>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </TabsContent>
          <TabsContent value="existing_user" className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label>Utilisateur *</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom"}
                      {p.email ? ` — ${p.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Téléphone (optionnel)</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label>Zone (optionnel)</Label>
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger><SelectValue placeholder="Aucune zone" /></SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={submit} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
          Créer le référent
        </Button>
      </CardContent>
    </Card>
  );
};

export default CreateReferentForm;
