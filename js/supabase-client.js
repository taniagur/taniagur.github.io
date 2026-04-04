import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ldgxkbpschmbjtlrmjaf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oarl1vLzzyL4YuwKAFVl0g_MZLfjls6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase client initialized');
