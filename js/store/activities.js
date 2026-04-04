import { supabase } from '../supabase-client.js';

export async function getActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function addActivity(activity) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('activities')
    .insert({ ...activity, user_id: user.id })
    .select();
  return { data, error };
}

export async function updateActivity(id, updates) {
  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

export async function deleteActivity(id) {
  const { data, error } = await supabase
    .from('activities')
    .delete()
    .eq('id', id);
  return { data, error };
}
