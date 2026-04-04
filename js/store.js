import { supabase } from './supabase-client.js';

// --- Friends ---

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

// --- Activities ---

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

// --- Events ---

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
