// Creates (or updates the password of) the single login from .env. Re-run after changing APP_PASSWORD.
// Needs SUPABASE_SERVICE_ROLE_KEY (Dashboard → Project Settings → API Keys → secret key). It stays in .env and never reaches the browser.
import { createClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../src/utils/auth.js';

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_USERNAME, APP_PASSWORD } = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY || !APP_USERNAME || !APP_PASSWORD) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY, APP_USERNAME and APP_PASSWORD in .env');
if (APP_PASSWORD.length < 8) throw new Error('APP_PASSWORD must be at least 8 characters');

const admin = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).auth.admin;
const email = usernameToEmail(APP_USERNAME);

const { data, error } = await admin.listUsers({ perPage: 1000 });
if (error) throw error;
const existing = data.users.find(u => u.email === email);
const result = existing
  ? await admin.updateUserById(existing.id, { password: APP_PASSWORD })
  : await admin.createUser({ email, password: APP_PASSWORD, email_confirm: true });
if (result.error) throw result.error;
console.log(`${existing ? 'Updated password for' : 'Created'} login "${APP_USERNAME}".`);
