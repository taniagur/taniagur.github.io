import { supabase } from '../supabase-client.js';

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle();
  if (!error && !data) {
    // No profile row yet — create default
    const defaults = { onboarding_done: false };
    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .upsert({ id: user.id, settings: defaults }, { onConflict: 'id' })
      .select()
      .single();
    return { data: created ?? { settings: defaults }, error: createErr };
  }
  return { data, error };
}

export async function updateProfileSettings(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { message: 'Not authenticated' } };
  const { data: existing } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle();
  const settings = { ...(existing?.settings ?? {}), ...patch };
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, settings }, { onConflict: 'id' })
    .select();
  return { data, error };
}
