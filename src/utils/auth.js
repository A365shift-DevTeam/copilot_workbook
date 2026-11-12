// Supabase Auth needs an email, so a plain username maps to a fixed internal address.
// Shared by the login screen and scripts/create-user.js — keep them in sync.
export const usernameToEmail = username => {
  const u = String(username).trim().toLowerCase();
  return u.includes('@') ? u : `${u}@ambot365.local`;
};
