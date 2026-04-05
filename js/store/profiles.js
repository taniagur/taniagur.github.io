import { supabase } from '../supabase-client.js';

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle();
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
