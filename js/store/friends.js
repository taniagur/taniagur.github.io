import { supabase } from '../supabase-client.js';

export async function getFriends() {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function addFriend(friend) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('friends')
    .insert({ ...friend, user_id: user.id })
    .select();
  return { data, error };
}

export async function updateFriend(id, updates) {
  const { data, error } = await supabase
    .from('friends')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

export async function deleteFriend(id) {
  const { data, error } = await supabase
    .from('friends')
    .delete()
    .eq('id', id);
  return { data, error };
}
