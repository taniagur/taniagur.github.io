import { supabase } from '../supabase-client.js';

// Enrich events with participant data from event_participants + friends
async function enrichEvents(events) {
  if (!events?.length) return events ?? [];
  const ids = events.map(e => e.id);
  const { data: participants } = await supabase
    .from('event_participants')
    .select('event_id, friend_id, friends(id, name)')
    .in('event_id', ids);
  const byEvent = {};
  for (const p of (participants ?? [])) {
    if (!byEvent[p.event_id]) byEvent[p.event_id] = [];
    byEvent[p.event_id].push(p);
  }
  return events.map(e => {
    const parts = byEvent[e.id] ?? [];
    return {
      ...e,
      people_ids: parts.map(p => p.friend_id),
      people: parts.map(p => p.friends?.name ?? '').filter(Boolean).join(', '),
    };
  });
}

export async function getEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data, error };
  const enriched = await enrichEvents(data);
  return { data: enriched, error: null };
}

export async function addEvent(event, participantIds = []) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('events')
    .insert({ ...event, owner_id: user.id })
    .select()
    .single();
  if (error || !data) return { data: data ? [data] : null, error };
  // Insert participants
  if (participantIds.length) {
    await supabase.from('event_participants').insert(
      participantIds.map(fid => ({ event_id: data.id, friend_id: fid }))
    );
  }
  // Return enriched event
  const enriched = await enrichEvents([data]);
  return { data: enriched, error: null };
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
  // Participants are deleted by cascade (FK on event_participants)
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
  if (error) return { data, error };
  const enriched = await enrichEvents(data);
  return { data: enriched, error: null };
}
