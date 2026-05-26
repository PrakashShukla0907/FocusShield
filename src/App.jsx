import { useState, useEffect, useRef } from 'react';
import { Clock, Trash2, Globe, Play, Plus, X, Moon, Shield, XCircle } from 'lucide-react';

const DEFAULT_WORK_MODE = {
  enabled: false,
  startHour: 9,
  endHour: 17,
  blockedSites: [
    'youtube.com', 'x.com', 'instagram.com', 'facebook.com', 
    'reddit.com', 'netflix.com', 'snapchat.com'
  ],
};

const isChromeExt = typeof chrome !== 'undefined' && !!chrome.storage;
const save = (obj) => { if (isChromeExt) chrome.storage.local.set(obj); };

const fmtHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const disp = h % 12 === 0 ? 12 : h % 12;
  return `${disp}:00 ${ampm}`;
};

// ─────────────────────────────────────────────
const App = () => {
  const [usage,          setUsage]         = useState({});
  const [limits,         setLimits]        = useState({});
  const [workMode,       setWorkModeState] = useState(DEFAULT_WORK_MODE);
  const [inputMinutes,   setInputMinutes]  = useState('');
  const [currentDomain,  setCurrentDomain] = useState('');
  const [newSite,        setNewSite]       = useState('');
  const [siteLimitInput, setSiteLimitInput]= useState({}); // { domain: '30' }
  const [tick,           setTick]          = useState(0);
  const [closedCount,    setClosedCount]   = useState(null);
  const tickRef = useRef(null);

  // ── storage ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isChromeExt) return;
    chrome.storage.local.get(['usage', 'limits', 'workMode'], (result) => {
      setUsage(result.usage    || {});
      setLimits(result.limits  || {});
      setWorkModeState(result.workMode || DEFAULT_WORK_MODE);
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url) return;
      try {
        const u = new URL(tabs[0].url);
        if (['http:', 'https:'].includes(u.protocol))
          setCurrentDomain(u.hostname.replace(/^www\./, ''));
      } catch {}
    });
    const onChanged = (changes) => {
      if (changes.usage)    setUsage(changes.usage.newValue        ?? {});
      if (changes.limits)   setLimits(changes.limits.newValue      ?? {});
      if (changes.workMode) setWorkModeState(changes.workMode.newValue ?? DEFAULT_WORK_MODE);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // ── countdown tick ───────────────────────────────────────────
  const currentUsageMs = usage[currentDomain] || 0;
  const currentLimitMs = limits[currentDomain];
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (currentLimitMs) tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [currentLimitMs]);

  // ── helpers ──────────────────────────────────────────────────
  const formatTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    if (h > 0)           return `${h}h ${m % 60}m`;
    if (m === 0 && ms>0) return '< 1m';
    return `${m}m`;
  };

  const getRemainingTimer = () => {
    if (!currentLimitMs) return null;
    const rem = currentLimitMs - currentUsageMs;
    if (rem <= 0) return { minutes: 0, seconds: 0 };
    const s = Math.floor(rem / 1000);
    return { minutes: Math.floor(s / 60), seconds: s % 60 };
  };

  const timer        = getRemainingTimer();
  const hour         = new Date().getHours();
  const isNight      = hour >= 22 || hour < 6;
  const blockedSites = workMode.blockedSites || [];
  const isWorkActive = workMode.enabled && hour >= workMode.startHour && hour < workMode.endHour;
  const HOURS        = Array.from({ length: 24 }, (_, i) => i);

  // ── current site timer ───────────────────────────────────────
  const startTimer = () => {
    const mins = parseFloat(inputMinutes);
    if (!(mins > 0)) return;
    const updated = { ...limits, [currentDomain]: mins * 60000 + currentUsageMs };
    setLimits(updated); save({ limits: updated }); setInputMinutes('');
  };
  const deleteTimer = () => {
    const updated = { ...limits };
    delete updated[currentDomain];
    setLimits(updated); save({ limits: updated });
  };

  // ── work mode ────────────────────────────────────────────────
  const updateWorkMode = (patch) => {
    const updated = { ...workMode, ...patch };
    setWorkModeState(updated); save({ workMode: updated });
  };
  const addBlockedSite = () => {
    const cleaned = newSite.trim().toLowerCase()
      .replace(/^www\./, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!cleaned || blockedSites.includes(cleaned)) return;
    updateWorkMode({ blockedSites: [...blockedSites, cleaned] });
    setNewSite('');
  };
  const removeSite = (site) =>
    updateWorkMode({ blockedSites: blockedSites.filter(s => s !== site) });

  // Set a daily time limit (in minutes) for a specific site
  const setSiteLimit = (site, minStr) => {
    const mins = parseFloat(minStr);
    const updated = { ...limits };
    if (mins > 0) {
      updated[site] = mins * 60000; // pure daily cap (not offset by usage)
    } else {
      delete updated[site];
    }
    setLimits(updated); save({ limits: updated });
  };

  // Close all tabs whose domain is in the blocked sites list
  const closeBlockedTabs = () => {
    if (!isChromeExt) return;
    chrome.tabs.query({}, (tabs) => {
      let count = 0;
      tabs.forEach(tab => {
        try {
          const domain = new URL(tab.url).hostname.replace(/^www\./, '');
          if (blockedSites.includes(domain)) {
            chrome.tabs.remove(tab.id);
            count++;
          }
        } catch {}
      });
      setClosedCount(count);
      setTimeout(() => setClosedCount(null), 2500);
    });
  };

  // ── top usage ────────────────────────────────────────────────
  const topSites = Object.keys(usage)
    .filter(k => usage[k] > 0)
    .sort((a, b) => usage[b] - usage[a])
    .slice(0, 5);

  const barColors = ['bg-orange-500','bg-blue-400','bg-emerald-500','bg-purple-500','bg-rose-500'];

  // ── render ───────────────────────────────────────────────────
  return (
    <div style={{ width: '350px', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'sans-serif', minHeight: '440px', overflow: 'hidden' }}>
      <div className="custom-scrollbar" style={{ height: '440px', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* ══ HEADER ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', paddingLeft: '20px', paddingRight: '20px' }}>
          <img src="/icons/icon_48x48.png" alt="FocusShield" style={{ width: '48px', height: '48px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#000', letterSpacing: '-0.03em', marginTop: '8px', lineHeight: '1' }}>
            FocusShield
          </h1>

          {/* status pills */}
          {(isNight || isWorkActive) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              {isNight && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', fontSize: '10px', fontWeight: '600', background:'rgba(251,191,36,0.12)', color:'#b45309', border:'1px solid rgba(251,191,36,0.3)' }}>
                  <Moon size={9}/> Late-night
                </span>
              )}
              {isWorkActive && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '9999px', fontSize: '10px', fontWeight: '600', background:'rgba(99,102,241,0.1)', color:'#4f46e5', border:'1px solid rgba(99,102,241,0.25)' }}>
                  <Shield size={9}/> Work Mode Active
                </span>
              )}
            </div>
          )}
        </div>

        {/* ══ CURRENT SITE ══ */}
        {currentDomain && (
          <div style={{ paddingLeft: '20px', paddingRight: '20px', marginTop: '16px' }}>
            <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Current Site</p>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#000', letterSpacing: '-0.03em', marginTop: '4px', margin: 0 }}>{currentDomain}</h2>
            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', marginTop: '2px', margin: 0 }}>{formatTime(currentUsageMs)} today</p>

            <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '12px', marginBottom: '6px' }}>
              Time Limit
            </p>
            {!timer ? (
              <div style={{ display: 'flex', height: '34px', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <input
                  type="number"
                  placeholder="Set minutes…"
                  style={{ flex: 1, minWidth: 0, fontSize: '13px', backgroundColor: '#fff', border: 'none', outline: 'none', color: '#000', fontWeight: '500', padding: '0 12px' }}
                  value={inputMinutes}
                  onChange={e => setInputMinutes(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startTimer()}
                />
                <button onClick={startTimer} disabled={!inputMinutes}
                        style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: inputMinutes ? '#fff' : '#94a3b8', backgroundColor: inputMinutes ? '#000' : '#e2e8f0', border: 'none', cursor: inputMinutes ? 'pointer' : 'default', transition: 'background-color 0.2s' }}>
                  <Play size={10} fill="currentColor"/> Set
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '34px', padding: '0 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={13} color="#64748b"/>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#000', fontVariantNumeric: 'tabular-nums' }}>
                    {String(timer.minutes).padStart(2,'0')}:{String(timer.seconds).padStart(2,'0')}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>left</span>
                </div>
                <button onClick={deleteTimer} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '4px' }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ DIVIDER ══ */}
        <div style={{ margin: '16px 20px 0', borderTop: '1px solid #f1f5f9' }}/>

        {/* ══ WORK MODE ══ */}
        <div style={{ paddingLeft: '20px', paddingRight: '20px', marginTop: '12px' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0, lineHeight: 1 }}>Work Mode</p>
              <p style={{ fontSize: '11px', marginTop: '4px', margin: '4px 0 0 0', lineHeight: 1, fontWeight: '500', color: workMode.enabled ? (isWorkActive ? '#16a34a' : '#6366f1') : '#94a3b8' }}>
                {workMode.enabled
                  ? isWorkActive ? '🟢 Blocking now' : `Starts ${fmtHour(workMode.startHour)}`
                  : 'Off'}
              </p>
            </div>
            {/* Toggle */}
            <button
              onClick={() => updateWorkMode({ enabled: !workMode.enabled })}
              style={{ position: 'relative', display: 'inline-flex', height: '24px', width: '44px', flexShrink: 0, cursor: 'pointer', alignItems: 'center', borderRadius: '9999px', border: 'none', padding: 0, background: workMode.enabled ? '#6366f1' : '#cbd5e1', transition: 'background-color 0.2s' }}
            >
              <span style={{ display: 'inline-block', height: '18px', width: '18px', borderRadius: '9999px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transform: `translateX(${workMode.enabled ? '23px' : '3px'})`, transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}/>
            </button>
          </div>

          {/* Expanded panel */}
          {workMode.enabled && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Schedule */}
              <div>
                <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', margin: '0 0 6px 0' }}>
                  Block Hours
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={workMode.startHour}
                    onChange={e => updateWorkMode({ startHour: Number(e.target.value) })}
                    style={{ flex: 1, height: '32px', fontSize: '12px', fontWeight: '600', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 8px', backgroundColor: '#fff', outline: 'none' }}
                  >
                    {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                  <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>to</span>
                  <select
                    value={workMode.endHour}
                    onChange={e => updateWorkMode({ endHour: Number(e.target.value) })}
                    style={{ flex: 1, height: '32px', fontSize: '12px', fontWeight: '600', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 8px', backgroundColor: '#fff', outline: 'none' }}
                  >
                    {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </div>
              </div>

              {/* Close blocked tabs button */}
              <button
                onClick={closeBlockedTabs}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  border: closedCount !== null ? '1px solid rgba(22,163,74,0.3)' : '1px solid rgba(239,68,68,0.25)',
                  color: closedCount !== null ? '#16a34a' : '#dc2626',
                  background: closedCount !== null ? 'rgba(22,163,74,0.05)' : 'rgba(239,68,68,0.04)',
                }}
              >
                <XCircle size={13}/>
                {closedCount !== null
                  ? closedCount === 0
                    ? 'No blocked tabs open'
                    : `Closed ${closedCount} tab${closedCount > 1 ? 's' : ''} ✓`
                  : 'Close All Blocked Tabs'}
              </button>

              {/* Blocked Sites List */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                    Blocked Sites
                  </p>
                  <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: '600' }}>{blockedSites.length}</span>
                </div>

                <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  {/* Column headers */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ flex: 1, fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Site</span>
                    <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', width: '56px', textAlign: 'center' }}>
                      Limit
                    </span>
                    <span style={{ width: '20px' }}/>
                  </div>

                  {/* Site rows */}
                  <div className="custom-scrollbar" style={{ maxHeight: '130px', overflowY: 'auto' }}>
                    {blockedSites.map((site, idx) => {
                      const existingLimitMs = limits[site];
                      const displayMins = existingLimitMs
                        ? Math.round(existingLimitMs / 60000)
                        : '';
                      const inputVal = siteLimitInput[site] !== undefined
                        ? siteLimitInput[site]
                        : (displayMins !== '' ? String(displayMins) : '');

                      return (
                        <div key={site} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: idx === blockedSites.length - 1 ? 'none' : '1px solid #f8fafc', gap: '8px' }}>
                          {/* Site name */}
                          <span style={{ flex: 1, fontSize: '11px', color: '#334155', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            {site}
                          </span>

                          {/* Limit input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <input
                              type="number"
                              placeholder="∞"
                              style={{ width: '38px', height: '22px', fontSize: '10px', textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none', backgroundColor: '#fff', color: '#334155' }}
                              value={inputVal}
                              onChange={e => setSiteLimitInput(prev => ({ ...prev, [site]: e.target.value }))}
                              onBlur={e => {
                                setSiteLimit(site, e.target.value);
                                setSiteLimitInput(prev => {
                                  const n = { ...prev };
                                  delete n[site];
                                  return n;
                                });
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  setSiteLimit(site, e.target.value);
                                  setSiteLimitInput(prev => {
                                    const n = { ...prev };
                                    delete n[site];
                                    return n;
                                  });
                                  e.target.blur();
                                }
                              }}
                              title="Daily limit in minutes (blank = always blocked)"
                            />
                            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '500' }}>m</span>
                          </div>

                          {/* Remove */}
                          <button
                            onClick={() => removeSite(site)}
                            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
                          >
                            <X size={11} strokeWidth={2}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add site row */}
                  <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #f1f5f9', height: '34px' }}>
                    <input
                      type="text"
                      placeholder="Add domain (e.g. youtube.com)"
                      value={newSite}
                      onChange={e => setNewSite(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addBlockedSite()}
                      style={{ flex: 1, minWidth: 0, fontSize: '11px', padding: '0 12px', outline: 'none', border: 'none', backgroundColor: '#fff', color: '#334155', height: '100%' }}
                    />
                    <button
                      onClick={addBlockedSite}
                      disabled={!newSite.trim()}
                      style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: newSite.trim() ? '#fff' : '#94a3b8', backgroundColor: newSite.trim() ? '#000' : '#e2e8f0', border: 'none', flexShrink: 0, height: '100%', cursor: newSite.trim() ? 'pointer' : 'default' }}
                    >
                      <Plus size={10} strokeWidth={2.5}/> Add
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '4px', textAlign: 'right', margin: '4px 0 0 0' }}>
                  Blank limit = always blocked · enter minutes to allow daily
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ══ TODAY'S USAGE ══ */}
        <div style={{ margin: '16px 20px 0', borderTop: '1px solid #f1f5f9' }}/>
        <div style={{ padding: '12px 20px 16px' }}>
          <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px 0' }}>
            Today's Usage
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topSites.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0', fontStyle: 'italic', margin: 0 }}>No usage tracked yet.</p>
            ) : (
              topSites.map((domain, i) => {
                const spentMs   = usage[domain] || 0;
                const pct       = Math.max(4, (spentMs / (usage[topSites[0]] || 1)) * 100);
                const hasLimit  = !!limits[domain];
                const isBlocked = blockedSites.includes(domain) && workMode.enabled;
                return (
                  <div key={domain} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: '500' }}>
                        <Globe size={11} color="#cbd5e1" style={{ flexShrink: 0 }}/>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{domain}</span>
                        {hasLimit && (
                          <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '9999px', fontWeight: '700', background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>
                            LIMIT
                          </span>
                        )}
                        {isBlocked && (
                          <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '9999px', fontWeight: '700', background:'rgba(239,68,68,0.08)', color:'#ef4444' }}>
                            BLOCKED
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px', fontWeight: '600', flexShrink: 0, marginLeft: '8px' }}>
                        {formatTime(spentMs)}
                      </span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div className={barColors[i % barColors.length]} style={{ height: '100%', borderRadius: '9999px', transition: 'all 0.7s', width: `${pct}%` }}/>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
