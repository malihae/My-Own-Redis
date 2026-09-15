import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { TerminalWindow, Stack, Clock, ArrowUpRight, Plus, MagnifyingGlass, ArrowClockwise, Trash, X, ArrowRight, CaretRight, BookOpen, Lightning, Database, Copy, Check, Sun, Moon, Command, LockKey, DownloadSimple, DotsThree, Pulse, Info } from '@phosphor-icons/react';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import { NumberTicker } from './number-ticker.jsx';
import { AnimatedFilters } from './components/animated-filters.jsx';
import './styles.css';

const guide = [
  ['PING', 'Check that your server responds.', 'PING'],
  ['SET', 'Store a value. Use quotes to preserve spaces.', 'SET name "Maliha Ehsan"'],
  ['GET', 'Read a value. Missing keys return (nil).', 'GET name'],
  ['DEL', 'Delete a key. Returns 1 if removed, 0 if missing.', 'DEL name'],
  ['TTL', 'Seconds remaining. -1 means no expiry; -2 means missing.', 'TTL session'],
  ['EXPIRE', 'Give an existing key a lifetime in seconds.', 'EXPIRE session 60'],
  ['PERSIST', 'Remove the expiry from a key.', 'PERSIST session']
];
const initial = { entries: [], events: [], commands: 0, failures: 0, bytes: 0, expiring: 0, uptime: 0, mode: 'Connecting' };
const bytes = n => n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
const q = s => JSON.stringify(s);
function timeLeft(entry, now) { return entry.expiresAt === null ? null : Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)); }
function formatReply(result) { return result === null ? '(nil)' : String(result); }

function Modal({ title, children, onClose, dismissible = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => { ref.current?.close(); previous?.focus?.(); };
  }, []);
  return <dialog className="modal" ref={ref} onCancel={e => { e.preventDefault(); if (dismissible) onClose(); }} onClick={e => { if (dismissible && e.target === ref.current) onClose(); }}>
    <div className="modal-inner"><div className="panel-heading"><h2>{title}</h2>{dismissible && <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button>}</div>{children}</div>
  </dialog>;
}

function App() {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState('connecting');
  const [locked, setLocked] = useState(false);
  const [access, setAccess] = useState('');
  const [tab, setTab] = useState('workspace');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ key: '', value: '', ttl: '' });
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('myredis-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const input = useRef(null); const scroll = useRef(null); const toastTimer = useRef(null); const serial = useRef(0); const fetching = useRef(false); const requestBusy = useRef(false);
  const reduced = useReducedMotion();
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('myredis-theme', theme); }, [theme]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + clockOffset), 500); return () => clearInterval(id); }, [clockOffset]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [lines]);
  function toast(text) { setNotice(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setNotice(''), 4200); }
  async function api(path, data) {
    const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(8000) });
    const json = await response.json();
    if (response.status === 401) setLocked(true);
    if (!response.ok) throw new Error(json.error || 'The server could not complete this request.');
    return json;
  }
  async function refresh() {
    if (fetching.current) return;
    fetching.current = true;
    try { const data = await api('state'); setState(data); setClockOffset(data.serverTime - Date.now()); setStatus('online'); }
    catch { setStatus('offline'); }
    finally { fetching.current = false; }
  }
  useEffect(() => {
    let active = true;
    api('session').then(data => { if (active) { setLocked(!data.authorized); if (data.authorized) refresh(); } }).catch(() => setStatus('offline'));
    const id = setInterval(() => { if (!document.hidden && !locked) refresh(); }, 1800);
    return () => { active = false; clearInterval(id); };
  }, [locked]);
  useEffect(() => {
    const handler = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setTab('workspace'); setTimeout(() => input.current?.focus(), 0); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);

  async function run(text, label) {
    const display = label || (Array.isArray(text) ? text.map(x => /\s/.test(x) ? q(x) : x).join(' ') : text);
    try {
      const result = await api('command', { command: text });
      setLines(previous => [...previous, { ...result, command: display, localId: ++serial.current }].slice(-100));
      setHistory(previous => [display, ...previous].slice(0, 50));
      if (!result.ok) throw new Error(result.error);
      await refresh(); return result;
    } catch (error) { toast(error.message); throw error; }
  }
  async function submit(e) {
    e.preventDefault(); if (!command.trim() || requestBusy.current) return;
    requestBusy.current = true; setBusy(true);
    const text = command; setCommand(''); setHistoryIndex(-1);
    try { await run(text); } catch {} finally { requestBusy.current = false; setBusy(false); input.current?.focus(); }
  }
  const visible = state.entries.filter(e => timeLeft(e, now) !== 0);
  const filtered = visible.filter(e => e.key.toLowerCase().includes(query.toLowerCase()) && (filter !== 'expiring' || e.expiresAt !== null));
  const entry = visible.find(e => e.key === selected);
  function openCreate(existing) { setForm(existing ? { key: existing.key, value: existing.value, ttl: existing.expiresAt === null ? '' : String(timeLeft(existing, now)) } : { key: '', value: '', ttl: '' }); setModal(existing ? 'edit' : 'create'); }
  async function saveKey(e) {
    e.preventDefault(); setBusy(true);
    try {
      const args = ['SET', form.key, form.value]; if (form.ttl !== '') args.push('EX', form.ttl);
      await run(args); setSelected(form.key); setModal(null); toast('Key saved.');
    } catch {} finally { setBusy(false); }
  }
  async function examples() {
    setBusy(true);
    try {
      for (const args of [['SET', 'demo:hello', 'Hello, Maliha!'], ['SET', 'demo:project', 'MyRedis Studio'], ['SET', 'demo:session', 'active', 'EX', '120']]) await run(args);
      toast('Three example keys added.');
    } catch {} finally { setBusy(false); }
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); toast('Copied to clipboard.'); } catch { toast('Clipboard unavailable. Select and copy the value manually.'); } }
  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: visible }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'myredis-keys.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <header className="topbar"><a href="/" className="brand"><span className="brand-mark">&gt;_</span><span>myredis<span className="brand-light"> / studio</span></span></a><div className="top-right"><span className="edition">BUILT BY MALIHA EHSAN</span><button className="icon-button" aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={21}/> : <Sun size={21}/>}</button><button className="help-button" onClick={() => setTab('guide')}><BookOpen size={18}/> Command guide <ArrowUpRight size={16}/></button></div></header>
    <div className="body-shell"><aside className="rail" aria-label="Workspace navigation"><div className="rail-buttons">{[['workspace', TerminalWindow, 'Workspace'], ['activity', Pulse, 'Activity'], ['guide', BookOpen, 'Command guide']].map(([id, Icon, label]) => <button key={id} className={'rail-button ' + (tab === id ? 'active' : '')} aria-label={label} aria-pressed={tab === id} title={label} onClick={() => setTab(id)}><Icon size={25}/></button>)}</div><span className="rail-label">MAKE. STORE. REPEAT.</span><span className="rail-version">01</span></aside>
    <main><div className="breadcrumb"><span>WORKSPACE</span><CaretRight size={13}/><span>{tab === 'workspace' ? 'COMMAND CENTER' : tab.toUpperCase()}</span></div>
      <section className="workspace-heading"><div><div className="eyebrow"><span className="mini-line"/> YOUR KEYS. YOUR RULES.</div><h1>{tab === 'workspace' ? 'A little command. A lot of control.' : tab === 'activity' ? 'Every command leaves a trace.' : 'Speak your server’s language.'}</h1><p>{tab === 'workspace' ? 'Run it. Store it. Watch it expire. Your server, now in full view.' : tab === 'activity' ? 'The latest 60 commands from your browser and TCP clients.' : 'A small command set with plenty of possibilities. Start with PING.'}</p></div><div className={'connection-badge ' + status}><span className="status-light"/><span>{status === 'online' ? 'SERVER ONLINE' : status === 'connecting' ? 'CONNECTING' : 'SERVER OFFLINE'}</span><button aria-label="Refresh connection" onClick={refresh}><ArrowClockwise size={16}/></button></div></section>
      {status === 'offline' && !locked && <div className="error-banner" role="alert">The server is unavailable. Check your terminal, then <button onClick={refresh}>try again</button>. Displayed data may be out of date.</div>}
      <section className="stats" aria-label="Workspace statistics"><div className="stat"><span className="stat-icon yellow"><Stack size={24}/></span><div><span className="stat-label">ACTIVE KEYS</span><strong><NumberTicker value={visible.length}/><span className="stat-note">in your workspace</span></strong></div></div><div className="stat"><span className="stat-icon"><Clock size={24}/></span><div><span className="stat-label">ON THE CLOCK</span><strong><NumberTicker value={visible.filter(e => e.expiresAt !== null).length}/><span className="stat-note">keys with expiration</span></strong></div></div><div className="stat"><span className="stat-icon"><Lightning size={24}/></span><div><span className="stat-label">COMMANDS RUN</span><strong><NumberTicker value={state.commands}/><span className="stat-note">since server start</span></strong></div></div><div className="stat"><span className="stat-icon"><Database size={24}/></span><div><span className="stat-label">VALUE SIZE</span><strong>{bytes(state.bytes)}<span className="stat-note">stored payload</span></strong></div></div></section>

      {tab === 'workspace' && <><section className="terminal-panel"><div className="terminal-top"><div className="terminal-title"><TerminalWindow size={19}/><span>THE COMMAND LINE</span><span className="terminal-tag">LIVE</span></div><button onClick={() => setLines([])}>Clear output <X size={14}/></button></div><div className="terminal-output" ref={scroll} role="log" aria-label="Command results" aria-live="polite">{lines.length === 0 ? <div className="terminal-welcome"><span className="welcome-symbol">&gt;_</span><div><p>Ready when you are<span className="cursor">_</span></p><span>Try <button onClick={() => { setCommand('PING'); input.current?.focus(); }}>PING</button> to say hello, or create your first key below.</span></div><div className="terminal-art" aria-hidden="true">MEMORY<br/>IN MOTION</div></div> : lines.map(line => <div className="terminal-line" key={line.localId}><div><span className="prompt-arrow">❯</span><span className="command-text">{line.command}</span><span className="duration">{line.duration} ms</span></div><pre className={line.ok ? 'reply' : 'reply fail'}>{line.ok ? formatReply(line.result) : line.error}</pre></div>)}</div><form className="command-input" onSubmit={submit}><span className="prompt-label">myredis <span>❯</span></span><input ref={input} value={command} onChange={e => setCommand(e.target.value)} aria-label="Redis command" placeholder={'SET name "Maliha"'} autoComplete="off" spellCheck="false" onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); const i = Math.min(historyIndex + 1, history.length - 1); setHistoryIndex(i); setCommand(history[i] || ''); } if (e.key === 'ArrowDown') { e.preventDefault(); const i = Math.max(historyIndex - 1, -1); setHistoryIndex(i); setCommand(history[i] || ''); } }}/><kbd className="shortcut">⌘ / Ctrl K</kbd><button className="run-button" disabled={busy || status !== 'online'}>Run <ArrowRight size={18}/></button></form><div className="terminal-bottom"><span><LockKey size={13}/> {state.mode}</span><span>↑ ↓ history <span className="divider">/</span> Enter to run</span></div></section>

      <section className="data-area"><div className="key-browser"><div className="section-heading"><div><h2>Key browser <span className="count">{visible.length}</span></h2><p>A home for everything you store.</p></div><button className="retro-button" disabled={status !== 'online'} onClick={() => openCreate()}><Plus size={18} weight="bold"/> New key</button></div><div className="browser-toolbar"><label className="search"><MagnifyingGlass size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a key..." aria-label="Find a key"/></label><AnimatedFilters value={filter} onChange={setFilter}/><button className="icon-button export" aria-label="Export keys as JSON" title="Export keys as JSON" onClick={exportData}><DownloadSimple size={19}/></button></div><div className="table-wrap"><table><thead><tr><th>KEY NAME</th><th>VALUE PREVIEW</th><th>TTL</th><th><span className="sr-only">Open key</span></th></tr></thead><tbody>{filtered.map(e => { const ttl = timeLeft(e, now); return <tr key={e.key} className={selected === e.key ? 'selected' : ''}><td><button className="key-name" onClick={() => setSelected(e.key)}><span className="key-symbol">#</span>{e.key}</button></td><td><span className="value-preview">{e.value || '(empty string)'}</span></td><td>{ttl === null ? <span className="ttl persistent">∞ <span>No expiry</span></span> : <span className={'ttl ' + (ttl < 20 ? 'urgent' : '')}><Clock size={13}/>{ttl}s</span>}</td><td><button className="icon-button" aria-label={`Inspect ${e.key}`} onClick={() => setSelected(e.key)}><ArrowUpRight size={18}/></button></td></tr>; })}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Stack size={34} weight="duotone"/><h3>{query || filter !== 'all' ? 'No matching keys' : 'An empty canvas. Make it yours.'}</h3><p>{query || filter !== 'all' ? 'Try another search or switch to all keys.' : 'Add a key, or give the workspace a quick test drive.'}</p>{!query && filter === 'all' && <button className="text-button" disabled={busy || status !== 'online'} onClick={examples}>Load example keys <ArrowRight size={17}/></button>}</div>}</div><div className="table-footer"><span>{filtered.length} of {visible.length} keys</span><span>Auto-refresh <span className="tiny-dot"/></span></div></div>

      <aside className="inspector"><div className="panel-heading"><h2>{entry ? 'Key inspector' : 'Under the hood'}</h2>{entry ? <button className="icon-button" aria-label="Close inspector" onClick={() => setSelected(null)}><X size={19}/></button> : <Info size={20}/>}</div>{entry ? <div className="inspector-content"><span className="eyebrow">STRING</span><h3 className="inspector-key">{entry.key}</h3><div className="inspect-meta"><span>{bytes(entry.bytes)}</span><span>{timeLeft(entry, now) === null ? 'No expiration' : timeLeft(entry, now) + 's remaining'}</span></div><div className="value-label"><label>VALUE</label><button className="icon-button" aria-label="Copy value" onClick={() => copy(entry.value)}><Copy size={17}/></button></div><pre className="value-box">{entry.value || '(empty string)'}</pre><div className="inspector-actions"><button className="retro-button secondary" onClick={() => openCreate(entry)}>Edit key <ArrowUpRight size={16}/></button><button className="icon-button danger" aria-label="Delete selected key" onClick={() => setModal('delete')}><Trash size={20}/></button></div>{entry.expiresAt !== null && <button className="text-button" onClick={() => run(['PERSIST', entry.key]).then(() => toast('Expiration removed.')).catch(() => {})}>Keep this key forever <Clock size={16}/></button>}</div> : <div className="inspector-content"><span className="engine-stamp"><Database size={34}/></span><h3>Your server.<br/>No black box.</h3><p>Every command runs on your backend. Select a key to inspect its value and lifetime.</p><div className="engine-details"><span>ENGINE</span><strong>{state.mode}</strong><span>STORAGE</span><strong>{state.mode === 'Custom engine' ? 'Memory · resets on restart' : 'External Redis database'}</strong><span>AVAILABLE COMMANDS</span><div className="command-chips">{guide.map(([name]) => <button key={name} onClick={() => { setCommand(name + (name === 'PING' ? '' : ' ')); input.current?.focus(); }}>{name}</button>)}</div></div></div>}</aside></section></>}

      {tab === 'activity' && <section className="activity-panel"><div className="section-heading"><h2>Command activity</h2><span className="muted">Values are omitted from this log.</span></div>{state.events.length === 0 ? <div className="empty-state"><Pulse size={36}/><h3>Nothing has run yet.</h3><p>Your next command will appear here.</p></div> : <div className="table-wrap"><table><thead><tr><th>COMMAND</th><th>KEY</th><th>SOURCE</th><th>RESULT</th><th>TIME</th></tr></thead><tbody>{state.events.map(e => <tr key={e.id}><td><code>{e.command}</code></td><td>{e.key ?? '—'}</td><td>{e.source}</td><td><span className={e.ok ? 'success-text' : 'error-text'}>{e.ok ? 'Success' : 'Failed'}</span></td><td>{new Date(e.at).toLocaleTimeString()}</td></tr>)}</tbody></table></div>}</section>}

      {tab === 'guide' && <section className="guide-grid">{guide.map(([name, description, example]) => <article className="guide-card" key={name}><span className="guide-command">{name}</span><p>{description}</p><button className="example-command" onClick={() => { setTab('workspace'); setCommand(example); setTimeout(() => input.current?.focus(), 0); }}><code>{example}</code><ArrowUpRight size={18}/></button></article>)}<article className="guide-card yellow-card"><Clock size={28}/><h3>Some things need a deadline.</h3><p>Add <code>EX 60</code> to SET for a key that disappears after a minute.</p><button className="example-command" onClick={() => { setTab('workspace'); setCommand('SET session active EX 60'); }}><code>SET session active EX 60</code><ArrowUpRight size={18}/></button></article></section>}
      <footer><span><span className="footer-mark">&gt;_</span> SMALL SERVER. BIG POSSIBILITIES.</span><span>MyRedis Studio <span className="footer-dot">·</span> v1.0</span></footer>
    </main></div>
    <AnimatePresence>{notice && <motion.div role="status" className="toast" initial={reduced ? false : { y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}><Info size={19}/>{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></motion.div>}</AnimatePresence>

    {(modal === 'create' || modal === 'edit') && <Modal title={modal === 'edit' ? 'Edit key' : 'Create a little possibility'} onClose={() => setModal(null)}><form className="key-form" onSubmit={saveKey}><label>Key name<input required maxLength={256} value={form.key} readOnly={modal === 'edit'} onChange={e => setForm({ ...form, key: e.target.value })} placeholder="e.g. project:name" autoFocus/></label><label>Value<textarea required={false} maxLength={65536} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="A name, a note, a little JSON..." rows={5}/></label><label>Expire after <span className="muted">(optional)</span><div className="ttl-input"><input type="number" min="1" max="2147483" step="1" value={form.ttl} onChange={e => setForm({ ...form, ttl: e.target.value })} placeholder="No expiration"/><span>seconds</span></div></label><p className="form-note">Saving an existing key replaces its value and expiration.</p><div className="form-actions"><button type="button" className="text-button" onClick={() => setModal(null)}>Cancel</button><button className="retro-button" disabled={busy}>Save key <ArrowRight size={18}/></button></div></form></Modal>}
    {modal === 'delete' && entry && <Modal title="Delete this key?" onClose={() => setModal(null)}><div className="delete-content"><p><strong>{entry.key}</strong> will be removed from your server. This cannot be undone.</p><div className="form-actions"><button className="text-button" onClick={() => setModal(null)}>Keep key</button><button className="retro-button delete-button" disabled={busy} onClick={async () => { setBusy(true); try { await run(['DEL', entry.key]); setModal(null); setSelected(null); toast('Key deleted.'); } catch {} finally { setBusy(false); } }}>Delete key <Trash size={18}/></button></div></div></Modal>}
    {locked && <Modal title="Open your workspace" dismissible={false} onClose={() => {}}><form className="key-form" onSubmit={async e => { e.preventDefault(); try { await api('session', { token: access }); setAccess(''); setLocked(false); } catch (error) { toast(error.message); } }}><p>This shared server requires an access key from its owner.</p><label>Workspace access key<input type="password" autoFocus required value={access} onChange={e => setAccess(e.target.value)}/></label><button className="retro-button">Connect <ArrowRight size={18}/></button></form></Modal>}
  </div></MotionConfig>;
}

createRoot(document.getElementById('root')).render(<App/>);
