import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import { createHandler } from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const handler=createHandler({admin:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,opts),userClient:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,opts),webpush});
Deno.serve(handler);

