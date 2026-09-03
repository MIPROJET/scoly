import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendBrevoEmail } from "../_shared/brevo.ts";
import { brandedEmail } from "../_shared/email-branding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const tempPassword = () =>
  `Scoly-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}!`;

const str = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const isUuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Configuration serveur manquante" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error: "Non autorisé" }, 401);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["super_admin", "admin"]);
    if (!callerRoles || callerRoles.length === 0) {
      return json({ error: "Accès réservé à l'administration" }, 403);
    }

    const body = await req.json().catch(() => ({}));

    const mode = body?.mode === "existing_user" ? "existing_user" : "new_user";
    const zoneId = isUuid(body?.zone_id) ? body.zone_id : null;

    // ---- École : existante ou nouvelle -------------------------------------
    let schoolId: string | null = isUuid(body?.school_id) ? body.school_id : null;
    const schoolName = str(body?.school_name);
    const schoolType = str(body?.school_type) || "secondary";
    const city = str(body?.city, 120);
    const region = str(body?.region, 120);
    const address = str(body?.address, 300);

    if (!schoolId && !schoolName) {
      return json({ error: "Sélectionnez un établissement ou saisissez son nom" }, 400);
    }

    // ---- Utilisateur gérant -------------------------------------------------
    let userId: string | null = null;
    let createdNow = false;
    let email = "";
    let firstName = str(body?.first_name, 100);
    let lastName = str(body?.last_name, 100);
    const phone = str(body?.phone, 30);

    if (mode === "existing_user") {
      if (!isUuid(body?.user_id)) return json({ error: "user_id requis" }, 400);
      userId = body.user_id as string;
      const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !existing?.user) return json({ error: "Utilisateur introuvable" }, 404);
      email = existing.user.email?.toLowerCase() ?? "";
      const { data: prof } = await admin
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", userId)
        .maybeSingle();
      firstName = firstName || prof?.first_name || "";
      lastName = lastName || prof?.last_name || "";
    } else {
      email = str(body?.email, 200).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email invalide" }, 400);
      if (!firstName || !lastName) return json({ error: "Nom et prénom requis" }, 400);

      const { data: existingList } = await admin.auth.admin.listUsers();
      const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        userId = existing.id;
      } else {
        const password = tempPassword();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName },
        });
        if (createError || !created?.user) {
          console.error("[create-referent] createUser", createError?.message);
          return json({ error: "Impossible de créer le compte référent" }, 500);
        }
        userId = created.user.id;
        createdNow = true;
        (globalThis as any).__tmpPassword = password;
      }
    }

    // Profil
    await admin.from("profiles").upsert({
      id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
      ...(phone ? { phone } : {}),
    });

    // Rôle référent
    const { error: roleError } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "referent" }, { onConflict: "user_id,role" });
    if (roleError) console.error("[create-referent] role", roleError.message);

    // École : création ou rattachement du gérant
    if (schoolId) {
      const { error: schErr } = await admin
        .from("schools")
        .update({ admin_user_id: userId })
        .eq("id", schoolId);
      if (schErr) console.error("[create-referent] school link", schErr.message);
    } else {
      const { data: newSchool, error: schErr } = await admin
        .from("schools")
        .insert({
          name: schoolName,
          type: schoolType,
          city: city || null,
          region: region || null,
          address: address || null,
          email: email || null,
          phone: phone || null,
          admin_user_id: userId,
          is_active: true,
          is_verified: true,
        })
        .select("id")
        .maybeSingle();
      if (schErr) {
        console.error("[create-referent] school insert", schErr.message);
        return json({ error: "Impossible de créer l'établissement" }, 500);
      }
      schoolId = newSchool?.id ?? null;
    }

    // Trace administrative dans referent_applications (statut approuvé)
    await admin.from("referent_applications").insert({
      submitted_by: caller.id,
      submitted_role: "admin",
      zone_id: zoneId,
      school_id: schoolId,
      first_name: firstName || "-",
      last_name: lastName || "-",
      email: email || "-",
      phone: phone || "-",
      school_name: schoolName || null,
      city: city || null,
      region: region || null,
      address: address || null,
      status: "approved",
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      created_user_id: userId,
    });

    await admin.from("notifications").insert({
      user_id: userId,
      type: "account",
      title: "Votre compte référent Scoly est actif",
      message: "Votre espace référent est disponible sur /me.",
      data: { school_id: schoolId },
    });

    const siteUrl = Deno.env.get("SITE_URL") || "https://scoly.ci";
    if (email) {
      try {
        const password = (globalThis as any).__tmpPassword;
        const html = brandedEmail({
          title: "Votre compte référent Scoly",
          preheader: "Votre espace référent est actif",
          bodyHtml: `
            <p>Bonjour ${firstName},</p>
            <p>Un compte <strong>référent Scoly</strong> vient d'être créé pour vous.</p>
            ${createdNow && password ? `<ul>
              <li>Email : <strong>${email}</strong></li>
              <li>Mot de passe temporaire : <strong>${password}</strong></li>
            </ul>
            <p style="color:#dc2626;"><strong>Changez votre mot de passe dès la première connexion.</strong></p>` : `<p>Connectez-vous avec votre compte existant.</p>`}
          `,
          ctaText: "Accéder à mon espace référent",
          ctaUrl: `${siteUrl}/me`,
        });
        await sendBrevoEmail({
          to: email,
          subject: "🎓 Votre compte référent Scoly est actif",
          html,
          category: "referent_welcome",
          emailType: "transactional",
          dedupeKey: `referent-created-${userId}`,
          metadata: { userId, schoolId },
        });
      } catch (mailErr) {
        console.error("[create-referent] email failed (non-blocking)");
      }
    }

    return json({ success: true, userId, schoolId, created: createdNow });
  } catch (error) {
    console.error("[create-referent] error", error);
    return json({ error: "Une erreur interne est survenue" }, 500);
  }
});
