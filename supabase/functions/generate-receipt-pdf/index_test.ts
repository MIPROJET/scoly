// Tests basiques de la fonction generate-receipt-pdf.
// Exécution : deno test --allow-net --allow-env supabase/functions/generate-receipt-pdf/index_test.ts
// Ces tests valident le rejet des requêtes non authentifiées et des payloads invalides,
// sans nécessiter de vraie base de données (ils ciblent une instance locale déjà démarrée
// via `supabase functions serve generate-receipt-pdf`).

const FUNCTION_URL = Deno.env.get("FUNCTION_URL") ?? "http://127.0.0.1:54321/functions/v1/generate-receipt-pdf";

Deno.test({
  name: "refuse une requête sans en-tête Authorization",
  ignore: !Deno.env.get("RUN_EDGE_TESTS"),
  async fn() {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: "00000000-0000-0000-0000-000000000000" }),
    });
    if (res.status !== 401) {
      throw new Error(`Attendu 401, reçu ${res.status}`);
    }
  },
});

Deno.test({
  name: "refuse une requête avec un token invalide",
  ignore: !Deno.env.get("RUN_EDGE_TESTS"),
  async fn() {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-invalide",
      },
      body: JSON.stringify({ order_id: "00000000-0000-0000-0000-000000000000" }),
    });
    if (res.status !== 401) {
      throw new Error(`Attendu 401, reçu ${res.status}`);
    }
  },
});

Deno.test({
  name: "refuse une requête sans order_id (validation d'entrée)",
  ignore: !Deno.env.get("RUN_EDGE_TESTS") || !Deno.env.get("TEST_USER_JWT"),
  async fn() {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("TEST_USER_JWT")}`,
      },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) {
      throw new Error(`Attendu 400, reçu ${res.status}`);
    }
  },
});

Deno.test({
  name: "répond à une requête OPTIONS (CORS preflight)",
  ignore: !Deno.env.get("RUN_EDGE_TESTS"),
  async fn() {
    const res = await fetch(FUNCTION_URL, { method: "OPTIONS" });
    if (res.status !== 200) {
      throw new Error(`Attendu 200 sur OPTIONS, reçu ${res.status}`);
    }
  },
});
