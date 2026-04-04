import { supabase } from '../supabase-client.js';

export async function getEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function addEvent(event) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('events')
    .insert({ ...event, owner_id: user.id })
    .select();
  return { data, error };
}

export async function updateEvent(id, updates) {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

export async function deleteEvent(id) {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);
  return { data, error };
}

export async function getSharedEvents() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('shared_with_id', user.id)
    .order('created_at', { ascending: false });
  return { data, error };
}
