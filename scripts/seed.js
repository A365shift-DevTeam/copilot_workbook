// Imports the workbook into Supabase. Re-runnable: rows with the same ID are overwritten by the xlsx.
// Usage: npm run seed [-- path/to/file.xlsx]
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../src/utils/auth.js';

const file = process.argv[2] || 'Ambot365_Normal_and_Practice 1.xlsx';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
// Tables are restricted to signed-in users, so seed as the app login.
const login = await supabase.auth.signInWithPassword({ email: usernameToEmail(process.env.APP_USERNAME || ''), password: process.env.APP_PASSWORD || '' });
if (login.error) throw new Error(`Sign-in failed (${login.error.message}) — run \`npm run create-user\` first.`);

const wb = XLSX.readFile(file);
const topics = [], prompts = [];
wb.SheetNames.forEach((sheet, position) => {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
  const meta = Object.fromEntries(rows.slice(0, 4).map(([k, v]) => [k, String(v).trim()]));
  const id = meta['Topic ID'];
  if (!id || rows[5]?.[0] !== 'Prompt name') throw new Error(`Sheet "${sheet}" does not match the Ambot365 template`);
  topics.push({ id, name: meta['Ambot365 Topic'], icon: meta['Built-in icon'] || 'generic', day: meta.Day === 'Day 2' ? 'day2' : 'day1', position });
  rows.slice(6).filter(r => r[0] || r[1]).forEach(([name, text, pid, ...overflow], i) => {
    // Template note: long text continues across columns after the ID column.
    prompts.push({ id: String(pid || `${id}-${i + 1}`), topic_id: id, name: String(name).slice(0, 65), text: String(text) + overflow.join(''), position: i });
  });
});
const links = [
  { id: 'ambot365-site', name: 'Ambot365 Website', url: 'https://ambot365.com/', position: 0 },
  { id: 'learn-ai', name: 'learn AI', url: 'https://learnai.ambot365.com/', position: 1 },
];

for (const [table, rows] of [['topics', topics], ['prompts', prompts], ['links', links]]) {
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`${table}: ${error.message} — did you run supabase/schema.sql?`);
}
const count = async t => (await supabase.from(t).select('*', { count: 'exact', head: true })).count;
console.log(`Imported ${topics.length} topics, ${prompts.length} prompts. DB now has ${await count('topics')} topics, ${await count('prompts')} prompts, ${await count('links')} links.`);
