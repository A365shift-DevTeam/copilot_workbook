import { useEffect, useRef, useState } from 'react';
import { supabase } from './utils/supabase';
import Timer from './Timer.jsx';

const PREFS_KEY = 'ambot365_workshop_prefs';
const WEBSITE_LOGO = 'https://ambot365.com/assets/AmBot%20365-Logo-DRLX41D4.png';
const INCLUDED_LOGO = '/logo.png';
const DAYS = [{ id: 'day1', name: 'Day 1' }, { id: 'day2', name: 'Day 2' }];
const ICONS = [['copilot', 'Microsoft 365 Copilot'], ['m365', 'Microsoft 365'], ['word', 'Word'], ['excel', 'Excel'], ['powerpoint', 'PowerPoint'], ['outlook', 'Outlook'], ['teams', 'Teams'], ['onenote', 'OneNote / Notebook'], ['sharepoint', 'SharePoint'], ['onedrive', 'OneDrive'], ['loop', 'Loop'], ['forms', 'Forms'], ['powerbi', 'Power BI'], ['image', 'Image generation']];
// Icon names saved before the official logos map onto them.
const ICON_ALIASES = { skills: 'copilot', note: 'onenote', generic: 'm365' };
// Practice topics are marked by this ID prefix (same as the Excel template's Topic ID column).
const PRACTICE_PREFIX = '__ambot_practice__';
const isPractice = t => t.id.startsWith(PRACTICE_PREFIX);
const SETTINGS_TABS = [['topics', 'Topics'], ['links', 'Links'], ['branding', 'Branding'], ['general', 'Timer & backup']];
const iconNames = new Set([...ICONS.map(i => i[0]), ...Object.keys(ICON_ALIASES)]);
const makeID = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const normalizedName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const countWords = text => (text.trim() ? text.trim().split(/\s+/).length : 0);
const nextPosition = rows => rows.reduce((m, r) => Math.max(m, r.position ?? 0), -1) + 1;

function safeIconData(value) { return typeof value === 'string' && value.length <= 180000 && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) ? value : ''; }
function checkedUrl(raw) { try { const u = new URL(String(raw).trim()); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null; return u.href; } catch { return null; } }

// Validates an imported backup (same format the original HTML exported).
function safeTopics(t) {
  if (!Array.isArray(t) || !t.length || t.length > 150) return null;
  const seenTopics = new Set(), seenTabs = new Set();
  const clean = t.map((topic, position) => {
    if (!topic || !Array.isArray(topic.tabs) || !topic.tabs.length) return null;
    let id = String(topic.id || makeID()); if (seenTopics.has(id)) id = makeID(); seenTopics.add(id);
    const tabs = topic.tabs.slice(0, 120).map((tab, i) => { if (!tab) return null; let tid = String(tab.id || makeID()); if (seenTabs.has(tid)) tid = makeID(); seenTabs.add(tid); return { id: tid, name: String(tab.name || 'Prompt').slice(0, 65), text: String(tab.text || '').slice(0, 200000), position: i }; });
    if (!tabs.every(Boolean)) return null;
    return { id, name: String(topic.name || 'Topic').slice(0, 45), icon: iconNames.has(topic.icon) ? topic.icon : 'generic', iconData: safeIconData(topic.iconData), day: topic.day === 'day2' ? 'day2' : 'day1', position, tabs };
  });
  return clean.every(Boolean) ? clean : null;
}
function safeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 75).filter(x => x && typeof x.name === 'string' && checkedUrl(x.url)).map((x, i) => ({ id: String(x.id || makeID()), name: x.name.slice(0, 65), url: checkedUrl(x.url), position: i }));
}

const topicRow = t => ({ id: t.id, name: t.name, icon: t.icon, icon_data: t.iconData || '', day: t.day, position: t.position });
const promptRow = (topicId, p) => ({ id: p.id, topic_id: topicId, name: p.name, text: p.text, position: p.position });

function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY)); if (p && typeof p === 'object') return p; } catch { /* storage unavailable */ }
  return {};
}

const imgSVG = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.3 3.2 2.6-2.6L21 19" /></svg>;
function AppIcon({ icon, iconData }) {
  const uploaded = safeIconData(iconData);
  if (uploaded) return <span className="appicon custom" aria-hidden="true"><img src={uploaded} alt="" /></span>;
  const value = ICON_ALIASES[icon] || (iconNames.has(icon) ? icon : 'm365');
  if (value === 'image') return <span className="appicon image" aria-hidden="true">{imgSVG}</span>;
  return <span className="appicon product" aria-hidden="true"><img src={`/icons/${value}.svg`} alt="" /></span>;
}

export default function App({ onSignOut }) {
  const [topics, setTopics] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [prefs, setPrefs] = useState(() => ({ selectedTopic: null, activeTabs: {}, collapsedDays: { day1: false, day2: true }, chime: false, logoMode: 'included', logoData: '', ...loadPrefs() }));
  const [toast, setToast] = useState({ msg: '', show: false });
  const [linksOpen, setLinksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('topics');
  const [nameModal, setNameModal] = useState(null); // 'add' | 'rename' | null
  const [nameInput, setNameInput] = useState('');
  const [topicForm, setTopicForm] = useState({ editingId: null, name: '', day: 'day1', icon: 'copilot', iconData: '' });
  const [linkForm, setLinkForm] = useState({ editingId: null, name: '', url: '' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toastTimer = useRef(), pendingText = useRef({}), iconUploadVersion = useRef(0);
  const editorRef = useRef(), linksHolderRef = useRef(), closeSettingsRef = useRef(), nameInputRef = useRef(), topicNameRef = useRef(), linkNameRef = useRef();
  const drawerPrevFocus = useRef(null);
  const iconFileRef = useRef(), logoFileRef = useRef(), backupFileRef = useRef();

  const notify = msg => { setToast({ msg, show: true }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000); };
  // Every write goes through here so a failed save is never silent.
  const db = async query => { const { error } = await query; if (error) { notify('Not saved to database: ' + error.message); return false; } return true; };
  const updatePrefs = patch => setPrefs(p => ({ ...p, ...patch }));

  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* prefs are a convenience only */ } }, [prefs]);

  async function loadAll() {
    const [t, p, l] = await Promise.all([
      supabase.from('topics').select('*').order('position'),
      supabase.from('prompts').select('*').order('position'),
      supabase.from('links').select('*').order('position'),
    ]);
    const error = t.error || p.error || l.error;
    if (error) { setLoadError(error.message); setLoading(false); return; }
    setTopics(t.data.map(x => ({ id: x.id, name: x.name, icon: x.icon, iconData: x.icon_data, day: x.day, position: x.position, tabs: p.data.filter(y => y.topic_id === x.id) })));
    setLinks(l.data);
    setLoadError(''); setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const visibleTopics = topics.filter(t => isPractice(t) === !!prefs.practiceMode);
  const current = visibleTopics.find(t => t.id === prefs.selectedTopic) || visibleTopics[0];
  const currentTab = current && (current.tabs.find(x => x.id === prefs.activeTabs[current.id]) || current.tabs[0]);
  const setTopic = (id, fn) => setTopics(ts => ts.map(t => (t.id === id ? fn(t) : t)));
  const selectTopic = id => updatePrefs({ selectedTopic: id });
  const selectTab = (topicId, tabId) => setPrefs(p => ({ ...p, activeTabs: { ...p.activeTabs, [topicId]: tabId } }));

  // ---- Prompt text: optimistic local update, debounced single-row save.
  function flushText(id) { const job = pendingText.current[id]; if (!job) return; clearTimeout(job.timer); delete pendingText.current[id]; return db(supabase.from('prompts').update({ text: job.text }).eq('id', id)); }
  function onEditorChange(e) {
    const text = e.target.value, id = currentTab.id;
    setTopic(current.id, t => ({ ...t, tabs: t.tabs.map(x => (x.id === id ? { ...x, text } : x)) }));
    clearTimeout(pendingText.current[id]?.timer);
    pendingText.current[id] = { text, timer: setTimeout(() => flushText(id), 700) };
  }
  const flushAll = () => Promise.all(Object.keys(pendingText.current).map(flushText));
  // Save unsent prompt text while the session is still valid.
  async function signOut() { await flushAll(); onSignOut(); }
  useEffect(() => { window.addEventListener('pagehide', flushAll); return () => window.removeEventListener('pagehide', flushAll); }, []);

  async function copyPrompt() {
    const text = currentTab?.text || ''; if (!text) { notify('This prompt is empty.'); return; }
    try { if (!navigator.clipboard?.writeText) throw new Error('no clipboard'); await navigator.clipboard.writeText(text); notify('Prompt copied.'); }
    catch { const e = editorRef.current; e.focus(); e.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* unsupported */ } notify(ok ? 'Prompt copied.' : 'Selected your prompt. Press Ctrl+C to copy.'); }
  }
  async function pastePrompt() {
    const editor = editorRef.current;
    try {
      if (!navigator.clipboard?.readText) throw new Error('no clipboard');
      const pasted = await navigator.clipboard.readText(); if (!pasted) { notify('Nothing to paste.'); return; }
      editor.setRangeText(pasted, editor.selectionStart, editor.selectionEnd, 'end');
      onEditorChange({ target: editor }); editor.focus(); notify('Text pasted.');
    } catch { editor.focus(); notify('Press Ctrl+V to paste (clipboard permission is unavailable).'); }
  }

  // ---- Prompt tabs
  function openNameModal(mode) { setNameModal(mode); setNameInput(mode === 'rename' ? currentTab.name : ''); setTimeout(() => nameInputRef.current?.focus(), 20); }
  async function submitNameModal(e) {
    e.preventDefault(); const name = nameInput.trim().slice(0, 65); if (!name) return; const mode = nameModal;
    if (mode === 'rename') {
      const id = currentTab.id;
      setTopic(current.id, t => ({ ...t, tabs: t.tabs.map(x => (x.id === id ? { ...x, name } : x)) }));
      setNameModal(null);
      if (await db(supabase.from('prompts').update({ name }).eq('id', id))) notify('Prompt tab renamed.');
    } else {
      const tab = { id: makeID(), name, text: '', position: nextPosition(current.tabs) };
      setTopic(current.id, t => ({ ...t, tabs: [...t.tabs, tab] })); selectTab(current.id, tab.id);
      setNameModal(null); editorRef.current?.focus();
      if (await db(supabase.from('prompts').insert(promptRow(current.id, tab)))) notify('New prompt tab added.');
    }
  }
  async function deleteTab() {
    if (current.tabs.length < 2 || !confirm('Delete the prompt tab "' + currentTab.name + '" and its content?')) return;
    const id = currentTab.id; flushText(id);
    setTopic(current.id, t => ({ ...t, tabs: t.tabs.filter(x => x.id !== id) })); selectTab(current.id, current.tabs.find(x => x.id !== id).id);
    if (await db(supabase.from('prompts').delete().eq('id', id))) notify('Prompt tab deleted.');
  }

  // ---- Topics
  async function moveTopic(id, delta) {
    const t = topics.find(x => x.id === id); if (!t) return;
    const members = topics.filter(x => x.day === t.day && isPractice(x) === isPractice(t)), other = members[members.indexOf(t) + delta]; if (!other) return;
    const a = topics.indexOf(t), b = topics.indexOf(other);
    const next = [...topics]; [next[a], next[b]] = [{ ...other, position: t.position }, { ...t, position: other.position }];
    // Positions may collide after imports; fall back to array order when they do.
    if (t.position === other.position) { next.forEach((x, i) => { next[i] = { ...x, position: i }; }); }
    setTopics(next);
    const changed = next.filter(x => topics.find(y => y.id === x.id).position !== x.position);
    if (await db(supabase.from('topics').upsert(changed.map(topicRow)))) notify(t.name + ' moved ' + (delta < 0 ? 'up.' : 'down.'));
  }
  function editTopic(id) { const t = topics.find(x => x.id === id); if (!t) return; setSettingsTab('topics'); iconUploadVersion.current++; setTopicForm({ editingId: id, name: t.name, day: t.day, icon: t.icon, iconData: t.iconData || '' }); topicNameRef.current?.focus(); }
  function clearTopicEdit() { iconUploadVersion.current++; setTopicForm({ editingId: null, name: '', day: current?.day || 'day1', icon: 'copilot', iconData: '' }); }
  async function onTopicIconFile(e) {
    const file = e.target.files?.[0]; if (!file) return; const version = ++iconUploadVersion.current;
    try {
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw Error('Choose an image below 5 MB.');
      const url = URL.createObjectURL(file); let image; try { image = new Image(); image.src = url; await image.decode(); } finally { URL.revokeObjectURL(url); }
      if (!image.width || !image.height) throw Error('This image could not be read.');
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const ctx = canvas.getContext('2d'), scale = Math.min(128 / image.width, 128 / image.height), w = image.width * scale, h = image.height * scale; ctx.drawImage(image, (128 - w) / 2, (128 - h) / 2, w, h);
      const result = canvas.toDataURL('image/png'); if (!safeIconData(result)) throw Error('Choose a simpler or smaller image.'); if (version !== iconUploadVersion.current) return;
      setTopicForm(f => ({ ...f, iconData: result })); notify('Square icon ready. Save the topic to keep it.');
    } catch (err) { if (version === iconUploadVersion.current) notify(err.message || 'Could not load the icon.'); } finally { e.target.value = ''; }
  }
  async function submitTopic(e) {
    e.preventDefault(); const { editingId, icon, iconData } = topicForm, name = topicForm.name.trim().slice(0, 45), day = topicForm.day === 'day2' ? 'day2' : 'day1'; if (!name) return;
    let ok;
    if (editingId) {
      const t = topics.find(x => x.id === editingId); if (!t) return;
      const updated = { ...t, name, icon, iconData, day, position: t.day !== day ? nextPosition(topics) : t.position };
      setTopics(ts => { const rest = ts.filter(x => x.id !== editingId); return t.day !== day ? [...rest, updated] : ts.map(x => (x.id === editingId ? updated : x)); });
      ok = await db(supabase.from('topics').update(topicRow(updated)).eq('id', editingId));
    } else {
      if (topics.length >= 150) { notify('Maximum of 150 topics.'); return; }
      const tab = { id: makeID(), name: 'Prompt 1', text: '', position: 0 };
      const t = { id: (prefs.practiceMode ? PRACTICE_PREFIX : '') + makeID(), name, icon, iconData, day, position: nextPosition(topics), tabs: [tab] };
      setTopics(ts => [...ts, t]); selectTopic(t.id);
      ok = await db(supabase.from('topics').insert(topicRow(t))) && await db(supabase.from('prompts').insert(promptRow(t.id, tab)));
    }
    updatePrefs({ collapsedDays: { ...prefs.collapsedDays, [day]: false } });
    clearTopicEdit(); if (ok) notify(editingId ? 'Topic updated.' : 'Topic added.');
  }
  async function deleteTopic(id) {
    const t = topics.find(x => x.id === id); if (!t || topics.length <= 1) return;
    if (!confirm('Delete "' + t.name + '" and all its prompt tabs?')) return;
    t.tabs.forEach(x => { clearTimeout(pendingText.current[x.id]?.timer); delete pendingText.current[x.id]; });
    setTopics(ts => ts.filter(x => x.id !== id));
    if (prefs.selectedTopic === id) { const first = visibleTopics.find(x => x.id !== id); if (first) updatePrefs({ selectedTopic: first.id, collapsedDays: { ...prefs.collapsedDays, [first.day]: false } }); }
    if (topicForm.editingId === id) clearTopicEdit();
    if (await db(supabase.from('topics').delete().eq('id', id))) notify('Topic deleted.');
  }

  // ---- Links: only validated HTTP(S) addresses.
  function editLink(id) { const item = links.find(x => x.id === id); if (!item) return; setLinkForm({ editingId: id, name: item.name, url: item.url }); linkNameRef.current?.focus(); }
  const clearLinkEdit = () => setLinkForm({ editingId: null, name: '', url: '' });
  async function submitLink(e) {
    e.preventDefault(); const name = linkForm.name.trim().slice(0, 65), url = checkedUrl(linkForm.url);
    if (!name || !url) { notify('Enter a valid http:// or https:// website URL.'); return; }
    let row;
    if (linkForm.editingId) { row = { ...links.find(x => x.id === linkForm.editingId), name, url }; setLinks(ls => ls.map(x => (x.id === row.id ? row : x))); }
    else { if (links.length >= 75) { notify('Maximum of 75 links.'); return; } row = { id: makeID(), name, url, position: nextPosition(links) }; setLinks(ls => [...ls, row]); }
    clearLinkEdit();
    if (await db(supabase.from('links').upsert(row))) notify('Website link saved.');
  }
  async function deleteLink(id) {
    const item = links.find(x => x.id === id); if (!item || !confirm('Delete the link "' + item.name + '"?')) return;
    setLinks(ls => ls.filter(x => x.id !== id)); if (linkForm.editingId === id) clearLinkEdit();
    if (await db(supabase.from('links').delete().eq('id', id))) notify('Link deleted.');
  }
  useEffect(() => {
    const close = e => { if (!linksHolderRef.current?.contains(e.target)) setLinksOpen(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, []);

  // ---- Branding (per browser)
  const logoSrc = prefs.logoMode === 'uploaded' && prefs.logoData ? prefs.logoData : prefs.logoMode === 'site' ? WEBSITE_LOGO : INCLUDED_LOGO;
  const logoFallback = e => { if (e.target.getAttribute('src') !== INCLUDED_LOGO) e.target.src = INCLUDED_LOGO; };
  async function onLogoFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw new Error('Choose an image below 5 MB.');
      const blobUrl = URL.createObjectURL(file); let image; try { image = new Image(); image.src = blobUrl; await image.decode(); } finally { URL.revokeObjectURL(blobUrl); }
      const scale = Math.min(1, 850 / image.width, 210 / image.height), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/png'); if (result.length > 650000) throw new Error('This logo is too large after resizing. Choose a smaller PNG or JPG.');
      updatePrefs({ logoData: result, logoMode: 'uploaded' }); notify('Logo uploaded and saved in this browser.');
    } catch (err) { notify(err.message || 'Could not load the logo.'); } finally { e.target.value = ''; }
  }

  // ---- Settings drawer, backup, fullscreen, keyboard
  function openSettings() { setLinksOpen(false); drawerPrevFocus.current = document.activeElement; setSettingsOpen(true); setTimeout(() => closeSettingsRef.current?.focus(), 100); }
  function closeSettings() { setSettingsOpen(false); drawerPrevFocus.current?.focus?.(); }
  function exportBackup() {
    flushAll();
    const data = { format: 'ambot365-workshop', version: 4, exportedAt: new Date().toISOString(), schemaVersion: 4, topics: topics.map(t => ({ ...t, activeTab: prefs.activeTabs[t.id] || t.tabs[0]?.id })), selectedTopic: current?.id, collapsedDays: prefs.collapsedDays, chime: prefs.chime, links, logoData: prefs.logoData, logoMode: prefs.logoMode };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Ambot365_Prompt_Workshop_Backup.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify('Backup exported.');
  }
  async function onBackupFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('File is too large.');
      const raw = JSON.parse(await file.text()), newTopics = safeTopics(raw?.topics); if (!newTopics) throw Error('Invalid backup.');
      const newLinks = Array.isArray(raw.links) ? safeLinks(raw.links) : links;
      if (!confirm('Replace existing topics and prompts with this backup?')) return;
      Object.values(pendingText.current).forEach(j => clearTimeout(j.timer)); pendingText.current = {};
      // Write the new rows first, then remove the old ones, so a failure never leaves the DB empty.
      const ok = await db(supabase.from('topics').upsert(newTopics.map(topicRow)))
        && await db(supabase.from('prompts').upsert(newTopics.flatMap(t => t.tabs.map(p => promptRow(t.id, p)))))
        && await db(supabase.from('links').upsert(newLinks));
      if (!ok) { await loadAll(); return; }
      const keepTopics = new Set(newTopics.map(t => t.id)), keepPrompts = new Set(newTopics.flatMap(t => t.tabs.map(p => p.id))), keepLinks = new Set(newLinks.map(l => l.id));
      const oldPrompts = topics.flatMap(t => t.tabs.map(p => p.id)).filter(id => !keepPrompts.has(id));
      const oldTopics = topics.map(t => t.id).filter(id => !keepTopics.has(id)), oldLinks = links.map(l => l.id).filter(id => !keepLinks.has(id));
      if (oldPrompts.length) await db(supabase.from('prompts').delete().in('id', oldPrompts));
      if (oldTopics.length) await db(supabase.from('topics').delete().in('id', oldTopics));
      if (oldLinks.length) await db(supabase.from('links').delete().in('id', oldLinks));
      const activeTabs = Object.fromEntries(raw.topics.filter(t => t?.id && t.activeTab).map(t => [String(t.id), String(t.activeTab)]));
      updatePrefs({ selectedTopic: keepTopics.has(raw.selectedTopic) ? raw.selectedTopic : newTopics[0].id, activeTabs, chime: !!raw.chime });
      clearTopicEdit(); clearLinkEdit(); await loadAll(); notify('Backup restored.');
    } catch (err) { notify('Could not import: ' + err.message); } finally { e.target.value = ''; }
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else notify('Fullscreen is not supported here. Use F11 on your computer.'); }
    catch { notify('Browser blocked fullscreen. Try F11 instead.'); }
  }
  useEffect(() => { const f = () => setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const timeModalOpen = useRef(false), closeTimeModal = useRef(() => {});
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (linksOpen) setLinksOpen(false); else if (nameModal) setNameModal(null); else if (timeModalOpen.current) closeTimeModal.current(); else if (settingsOpen) closeSettings();
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [linksOpen, nameModal, settingsOpen]);

  const tabNameShown = currentTab?.name || '';
  return (
    <>
      <header className="topbar">
        <div className="logo" aria-label="Ambot365"><img id="brandLogo" className="brand-logo-img" alt="Ambot365" src={logoSrc} onError={logoFallback} /></div>
        <div className="header-heading"><p className="eyebrow">AMBOT365 WEBINAR</p><h1>Microsoft 365 Copilot Prompt Workshop</h1></div>
        <div className="header-actions">
          <div className="links-holder" ref={linksHolderRef}>
            <button className="btn links-button" type="button" aria-haspopup="true" aria-expanded={linksOpen} aria-controls="linksMenu" onClick={() => setLinksOpen(o => !o)}>Links ▾</button>
            <div className="links-menu" id="linksMenu" role="menu" hidden={!linksOpen}>
              <div className="links-menu-heading">Open website</div>
              {!links.length && <div className="menu-empty">No links yet. Add one in Settings.</div>}
              {links.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setLinksOpen(false)}><span>{item.name}</span><span aria-hidden="true">↗</span></a>)}
            </div>
          </div>
          <button className="btn icon-btn" type="button" title="Open Settings" aria-label="Open settings" onClick={openSettings}><svg className="svgicon" viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="M19.4 15.3c.1-.5.2-1 .2-1.5s-.1-1-.2-1.5l2-1.5-2-3.5-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 4h-4l-.4 2.7A7.6 7.6 0 0 0 7 8.2l-2.4-.9-2 3.5 2 1.5c-.1.5-.2 1-.2 1.5s.1 1 .2 1.5l-2 1.5 2 3.5 2.4-.9a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.4-2.7a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.5-2-1.5Z" /></svg> Settings</button>
          <button className="btn icon-btn" type="button" title="Toggle fullscreen" onClick={toggleFullscreen}><svg className="svgicon" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /></svg><span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span></button>
          <button className="btn icon-btn" type="button" title="Sign out" onClick={signOut}><svg className="svgicon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg><span>Sign out</span></button>
        </div>
      </header>
      <main>
        <section className="hero"><Timer chime={prefs.chime} notify={notify} modalOpenRef={timeModalOpen} closeModalRef={closeTimeModal} /></section>
        <section className="workspace" aria-label="Workshop exercises">
          <aside className="sidebar">
            <div className="ds-segmented mode-switch" role="group" aria-label="Mode">
              <button type="button" className={'ds-segment' + (!prefs.practiceMode ? ' active' : '')} aria-pressed={!prefs.practiceMode} onClick={() => updatePrefs({ practiceMode: false })}>Workshop</button>
              <button type="button" className={'ds-segment' + (prefs.practiceMode ? ' active' : '')} aria-pressed={!!prefs.practiceMode} onClick={() => updatePrefs({ practiceMode: true })}>Practice</button>
            </div>
            <h2 className="side-label">{prefs.practiceMode ? 'Practice topics' : 'Topics'}</h2><p className="side-hint">Choose a day. Manage topics in Settings.</p>
            <div className="topics" aria-label="Webinar topics by day">
              {DAYS.map(day => {
                const members = visibleTopics.filter(t => t.day === day.id);
                return (
                  <details key={day.id} className="day-group" data-day={day.id} open={!prefs.collapsedDays[day.id]} onToggle={e => { const collapsed = !e.currentTarget.open; if (prefs.collapsedDays[day.id] !== collapsed) updatePrefs({ collapsedDays: { ...prefs.collapsedDays, [day.id]: collapsed } }); }}>
                    <summary>{day.name}<span className="day-count">{members.length} topics</span></summary>
                    <div className="day-topics">
                      {members.map((t, index) => (
                        <span key={t.id} style={{ display: 'contents' }}>
                          <button type="button" className={'topic' + (t.id === current?.id ? ' active' : '')} aria-pressed={t.id === current?.id} onClick={() => selectTopic(t.id)}><AppIcon icon={t.icon} iconData={t.iconData} /><span>{t.name}</span></button>
                          {day.id === 'day1' && (t.id === 'excel' || normalizedName(t.name) === 'excel') && index < members.length - 1 && <hr className="topic-divider" />}
                        </span>
                      ))}
                      {!members.length && <div className="empty-day">{loading ? 'Loading…' : 'Add topics in Settings.'}</div>}
                    </div>
                  </details>
                );
              })}
            </div>
          </aside>
          <article className="editor-card">
            {loadError ? (
              <div className="prompt-main"><h3 className="prompt-title">Could not load from Supabase</h3><p>{loadError}</p><p>Run <code>supabase/schema.sql</code> in the Supabase SQL Editor, then <code>npm run seed</code>.</p><button className="btn" type="button" onClick={loadAll}>Retry</button></div>
            ) : !current ? (
              <div className="prompt-main"><p>{loading ? 'Loading workshop…' : (prefs.practiceMode ? 'No practice topics yet. Add one in Settings.' : 'No topics yet. Run npm run seed or add a topic in Settings.')}</p></div>
            ) : (
              <>
                <div className="editor-header">
                  <div className="editor-headline"><h2>{current.name}</h2><span className="topic-meta">{current.tabs.length} prompt{current.tabs.length === 1 ? '' : 's'}</span></div>
                  <div className="tabs-shell" role="tablist" aria-label="Prompt tabs">
                    {current.tabs.map(x => <button key={x.id} type="button" className={'prompt-tab' + (x.id === currentTab?.id ? ' active' : '')} role="tab" aria-selected={x.id === currentTab?.id} title="Click to select; double-click to rename" onClick={() => selectTab(current.id, x.id)} onDoubleClick={() => openNameModal('rename')}>{x.name}</button>)}
                    <button type="button" className="add-tab" aria-label="Add prompt" title="Add prompt" onClick={() => openNameModal('add')}>+</button>
                  </div>
                </div>
                <div className="prompt-main">
                  <div className="prompt-toolbar"><h3 className="prompt-title">{tabNameShown}</h3><div className="prompt-controls">
                    <button className="btn small tool-btn" type="button" title="Rename prompt" aria-label="Rename prompt" onClick={() => openNameModal('rename')} disabled={!currentTab}><svg className="svgicon" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" /><path d="m13 6 5 5" /></svg></button>
                    <button className="btn small tool-btn danger" type="button" title="Delete prompt" aria-label="Delete prompt" disabled={current.tabs.length <= 1} onClick={deleteTab}><svg className="svgicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button>
                    <button className="btn small tool-btn" type="button" title="Paste prompt" aria-label="Paste prompt" onClick={pastePrompt} disabled={!currentTab}><svg className="svgicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5v17h14V4h-4" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M8 11h8M8 15h6" /></svg></button>
                    <button className="btn small tool-btn" type="button" title="Copy prompt" aria-label="Copy prompt" onClick={copyPrompt}><svg className="svgicon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></svg></button>
                  </div></div>
                  <textarea ref={editorRef} className="editor" spellCheck aria-label="Editable prompt" placeholder="Type or paste your exercise prompt here..." value={currentTab?.text || ''} onChange={onEditorChange} onBlur={() => currentTab && flushText(currentTab.id)} disabled={!currentTab} />
                  <div className="editor-foot"><span className="saved">Topic and prompt changes auto-save to the database.</span><span>{countWords(currentTab?.text || '')} words</span></div>
                </div>
              </>
            )}
          </article>
        </section>
      </main>

      <div className={'backdrop' + (settingsOpen ? ' open' : '')} onClick={closeSettings} />
      <aside className={'drawer' + (settingsOpen ? ' open' : '')} aria-labelledby="drawerTitle" aria-modal="true" role="dialog" aria-hidden={!settingsOpen}>
        <div className="drawer-head"><div><h2 id="drawerTitle">Workshop Settings</h2><p>Manage topics, links, branding and practice options.</p></div><button ref={closeSettingsRef} className="btn close-btn" aria-label="Close settings" onClick={closeSettings}>×</button></div>
        <div className="ds-segmented settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={settingsTab === id} className={'ds-segment' + (settingsTab === id ? ' active' : '')} onClick={() => setSettingsTab(id)}>{label}</button>)}
        </div>

        {settingsTab === 'topics' && (
          <div role="tabpanel">
            <form className="settings-card" onSubmit={submitTopic}>
              <h3>{topicForm.editingId ? 'Edit topic' : prefs.practiceMode ? 'Add a practice topic' : 'Add a workshop topic'}</h3>
              <label className="field-label" htmlFor="topicNameInput">Topic name</label>
              <input ref={topicNameRef} className="form-field" id="topicNameInput" type="text" maxLength={45} placeholder="e.g. Copilot Notebook" required value={topicForm.name} onChange={e => setTopicForm(f => ({ ...f, name: e.target.value }))} />
              <label className="field-label" htmlFor="topicDaySelect">Workshop day</label>
              <select className="form-field" id="topicDaySelect" value={topicForm.day} onChange={e => setTopicForm(f => ({ ...f, day: e.target.value }))}>{DAYS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <label className="field-label" htmlFor="topicIconSelect">Topic icon</label>
              <select className="form-field" id="topicIconSelect" value={topicForm.icon} onChange={e => setTopicForm(f => ({ ...f, icon: e.target.value }))}>{ICONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <div className="topic-icon-tools">
                <div className="topic-icon-preview" aria-label="Topic icon preview"><AppIcon icon={topicForm.icon} iconData={topicForm.iconData} /></div>
                <button className="btn small" type="button" onClick={() => iconFileRef.current.click()}>Upload square icon</button>
                <button className={'btn small' + (topicForm.iconData ? '' : ' hidden')} type="button" onClick={() => { iconUploadVersion.current++; setTopicForm(f => ({ ...f, iconData: '' })); }}>Use built-in icon</button>
              </div>
              <input ref={iconFileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={onTopicIconFile} />
              <p className="smallnote upload-note">PNG, JPG, WebP, GIF or SVG, up to 5 MB. Images fit inside a square without cropping.</p>
              <div className="form-row"><button className="btn primary" type="submit">{topicForm.editingId ? 'Save changes' : 'Add topic'}</button><button className={'btn' + (topicForm.editingId ? '' : ' hidden')} type="button" onClick={clearTopicEdit}>Cancel</button></div>
            </form>
            <h3 className="settings-heading">{prefs.practiceMode ? 'Practice topics' : 'Workshop topics'}</h3><p className="settings-subtitle">Use ↑ and ↓ to reorder within a day. Edit loads the topic into the form above.</p>
            {DAYS.map(day => {
              const members = visibleTopics.filter(t => t.day === day.id);
              return (
                <div key={day.id}>
                  <h4 className="setting-day-title">{day.name} · {members.length}</h4>
                  {members.map((t, index) => (
                    <div key={t.id} className={'setting-item' + (topicForm.editingId === t.id ? ' editing' : '')}>
                      <div className="setting-name"><AppIcon icon={t.icon} iconData={t.iconData} /><span title={t.name}>{t.name}</span></div>
                      <div className="setting-actions">
                        {[[-1, '↑'], [1, '↓']].map(([delta, label]) => <button key={delta} type="button" className="btn small move-topic" title={'Move ' + t.name + (delta < 0 ? ' up' : ' down')} aria-label={'Move ' + t.name + (delta < 0 ? ' up' : ' down')} disabled={delta < 0 ? index === 0 : index === members.length - 1} onClick={() => moveTopic(t.id, delta)}>{label}</button>)}
                        <button className="btn small" type="button" aria-label={'Edit ' + t.name} onClick={() => editTopic(t.id)}>Edit</button>
                        <button className="btn small danger" type="button" aria-label={'Delete ' + t.name} disabled={topics.length <= 1} onClick={() => deleteTopic(t.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {settingsTab === 'links' && (
          <div role="tabpanel">
            <form className="settings-card" onSubmit={submitLink}>
              <h3>{linkForm.editingId ? 'Edit website' : 'Add a website'}</h3>
              <label className="field-label" htmlFor="linkNameInput">Website name</label>
              <input ref={linkNameRef} className="form-field" id="linkNameInput" type="text" maxLength={65} placeholder="e.g. Microsoft Copilot" required value={linkForm.name} onChange={e => setLinkForm(f => ({ ...f, name: e.target.value }))} />
              <label className="field-label" htmlFor="linkUrlInput">Website URL</label>
              <input className="form-field" id="linkUrlInput" type="url" maxLength={1000} placeholder="https://example.com" required value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} />
              <div className="form-row"><button className="btn primary small" type="submit">{linkForm.editingId ? 'Save link' : 'Add link'}</button><button className={'btn small' + (linkForm.editingId ? '' : ' hidden')} type="button" onClick={clearLinkEdit}>Cancel</button></div>
            </form>
            <h3 className="settings-heading">Quick links</h3><p className="settings-subtitle">The Links button opens these websites in a new tab.</p>
            {!links.length && <p className="smallnote">No links yet.</p>}
            {links.map(item => (
              <div key={item.id} className="link-setting-item">
                <div className="link-setting-text"><strong>{item.name}</strong><small>{item.url}</small></div>
                <div className="setting-actions"><button type="button" className="btn small" onClick={() => editLink(item.id)}>Edit</button><button type="button" className="btn small danger" onClick={() => deleteLink(item.id)}>Delete</button></div>
              </div>
            ))}
          </div>
        )}

        {settingsTab === 'branding' && (
          <div role="tabpanel" className="settings-card">
            <h3>Workshop logo</h3><p className="settings-subtitle">Upload your own logo, or use the logo from the Ambot365 website.</p>
            <div className="brand-preview"><img alt="Current workshop logo" src={logoSrc} onError={logoFallback} /></div>
            <div className="form-row">
              <button className="btn small" type="button" onClick={() => logoFileRef.current.click()}>Upload logo</button>
              <button className="btn small" type="button" onClick={() => { updatePrefs({ logoMode: 'site' }); notify('Website logo selected. Internet may be required.'); }}>Website logo</button>
              <button className="btn small" type="button" onClick={() => { updatePrefs({ logoMode: 'included', logoData: '' }); notify('Original workshop logo restored.'); }}>Original</button>
            </div>
            <input ref={logoFileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={onLogoFile} />
            <p className="smallnote">PNG with transparent background is ideal. The logo choice is saved in this browser.</p>
          </div>
        )}

        {settingsTab === 'general' && (
          <div role="tabpanel">
            <div className="settings-card">
              <h3>Timer</h3>
              <label className="tick-row"><input type="checkbox" checked={!!prefs.chime} onChange={e => updatePrefs({ chime: e.target.checked })} /> Play a short chime when time ends</label>
              <p className="smallnote">The timer stays visible when you switch between topics and prompts.</p>
            </div>
            <div className="settings-card">
              <h3>Backup</h3>
              <p className="smallnote">Topics, prompts and links are stored in Supabase. Export a JSON backup any time, or import one (including backups from the old HTML version).</p>
              <div className="form-row"><button className="btn small" type="button" onClick={exportBackup}>Export backup</button><button className="btn small" type="button" onClick={() => backupFileRef.current.click()}>Import backup</button><input ref={backupFileRef} className="hidden" type="file" accept="application/json,.json" onChange={onBackupFile} /></div>
            </div>
          </div>
        )}
      </aside>

      <div className={'modal-backdrop' + (nameModal ? ' open' : '')} role="presentation" onClick={e => { if (e.target === e.currentTarget) setNameModal(null); }}>
        <form className="modal-box" role="dialog" aria-modal="true" aria-labelledby="nameModalTitle" onSubmit={submitNameModal}>
          <h2 id="nameModalTitle">{nameModal === 'rename' ? 'Rename prompt tab' : 'Add prompt tab'}</h2>
          <p>{nameModal === 'rename' ? 'Update the tab name. Your prompt text will stay saved.' : 'Create another prompt under ' + (current?.name || '') + '.'}</p>
          <input ref={nameInputRef} type="text" className="form-field" maxLength={65} required value={nameInput} onChange={e => setNameInput(e.target.value)} />
          <div className="modal-actions"><button className="btn" type="button" onClick={() => setNameModal(null)}>Cancel</button><button className="btn primary" type="submit">Save</button></div>
        </form>
      </div>
      <div className={'toast' + (toast.show ? ' show' : '')} role="status" aria-live="polite">{toast.msg}</div>
    </>
  );
}
