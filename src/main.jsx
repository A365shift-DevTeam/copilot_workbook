import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './utils/supabase';
import App from './App.jsx';
import Login from './Login.jsx';
import '../ambot365-design-system.css';
import './index.css';

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  return session ? <App onSignOut={() => supabase.auth.signOut()} /> : <Login />;
}

createRoot(document.getElementById('root')).render(<Root />);
