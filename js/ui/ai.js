import { supabase } from '../supabase-client.js';

const AI_PROXY_URL = 'https://ldgxkbpschmbjtlrmjaf.supabase.co/functions/v1/ai-proxy';

export async function callAI(type, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht eingeloggt.');

  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ type, payload }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
