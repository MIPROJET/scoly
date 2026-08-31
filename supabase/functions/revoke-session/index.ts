import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { sessionId } = await req.json().catch(() => ({ sessionId: null }));
    if (!sessionId || typeof sessionId !== 'string') return json({ error: 'sessionId required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The session must belong to the caller
    const { data: session, error: sessionError } = await admin
      .from('login_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) return json({ error: 'Lookup failed' }, 500);
    if (!session || session.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // 1) Flag the suspicious login
    const { error: updateError } = await admin
      .from('login_sessions')
      .update({ is_blocked: true, is_confirmed: false, confirmed_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) return json({ error: 'Could not block session' }, 500);

    // 2) Actually revoke every auth session/refresh token for that user,
    //    so the intruder's JWT can no longer be refreshed.
    let revoked = false;
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/logout`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      revoked = res.ok;
    } catch (_) {
      revoked = false;
    }

    if (!revoked) {
      const { error: rpcError } = await admin.rpc('force_logout_user', { _user_id: user.id });
      revoked = !rpcError;
      if (rpcError) console.error('[revoke-session] force_logout_user failed:', rpcError.message);
    }

    await admin.from('audit_logs').insert({
      user_id: user.id,
      action: 'session_revoked',
      entity_type: 'login_session',
      entity_id: sessionId,
      new_data: { blocked: true, auth_sessions_revoked: revoked, revoked_at: new Date().toISOString() },
    });

    return json({ success: true, revoked });
  } catch (error) {
    console.error('[revoke-session] error:', error);
    return json({ error: 'Unexpected error' }, 500);
  }
});
