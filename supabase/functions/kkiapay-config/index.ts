import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const publicKey = Deno.env.get('KKIAPAY_PUBLIC_KEY');
  const privateKey = Deno.env.get('KKIAPAY_PRIVATE_KEY');
  const secret = Deno.env.get('KKIAPAY_SECRET');
  if (!publicKey || !privateKey || !secret) {
    return new Response(JSON.stringify({ error: 'KkiaPay indisponible' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const testPrefixes = ['tpk_', 'tsk_'];
  const testKeyDetected = [publicKey, privateKey, secret]
    .some((value) => testPrefixes.some((prefix) => value.toLowerCase().startsWith(prefix)));
  if (testKeyDetected) {
    console.error('[KkiaPay] Refusing test credentials in LIVE mode');
    return new Response(JSON.stringify({
      error: 'Configuration KkiaPay incohérente : clés de test détectées en mode LIVE',
      environment: 'live',
      ready: false,
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(JSON.stringify({ publicKey, sandbox: false, environment: 'live', ready: true }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
});