import { useState, useEffect } from 'react';
import { Clock, Trash2, Globe, Play } from 'lucide-react';

const App = () => {
  const [usage, setUsage] = useState({});
  const [limits, setLimits] = useState({});
  const [inputMinutes, setInputMinutes] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');

  useEffect(() => {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['usage', 'limits'], (result) => {
        setUsage(result.usage || {});
        setLimits(result.limits || {});
      });

      // Get current active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          try {
            const urlObj = new URL(tabs[0].url);
            if (['http:', 'https:'].includes(urlObj.protocol)) {
              let domain = urlObj.hostname.replace('www.', '');
              setCurrentDomain(domain);
            }
          } catch (e) {}
        }
      });

      // Listen for changes
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.usage) setUsage(changes.usage.newValue);
        if (changes.limits) setLimits(changes.limits.newValue);
      });
    } else {
      // Fallback when not running as an extension
      setUsage({});
      setLimits({});
      setCurrentDomain('');
    }
  }, []);

  const formatTime = (ms) => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes === 0 && ms > 0) return '< 1m';
    return `${minutes}m`;
  };

  const currentUsageMs = usage[currentDomain] || 0;
  // Does current domain have a timer set?
  const currentLimitMs = limits[currentDomain];

  // Helper to get remaining timer for current domain
  const getRemainingTimer = () => {
    if (!currentLimitMs) return null;
    const remainingMs = currentLimitMs - currentUsageMs;
    if (remainingMs <= 0) return { minutes: 0, seconds: 0 };
    const totalSeconds = Math.floor(remainingMs / 1000);
    return {
      minutes: Math.floor(totalSeconds / 60),
      seconds: totalSeconds % 60
    };
  };

  const timer = getRemainingTimer();

  const startTimer = () => {
    if (inputMinutes > 0) {
      const limitMs = parseFloat(inputMinutes) * 60000 + currentUsageMs; // limit = usage + input
      
      const updatedLimits = { ...limits, [currentDomain]: limitMs };
      setLimits(updatedLimits);
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ limits: updatedLimits });
      }
      setInputMinutes('');
    }
  };

  const deleteTimer = () => {
      const updatedLimits = { ...limits };
      delete updatedLimits[currentDomain];
      setLimits(updatedLimits);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ limits: updatedLimits });
      }
  };

  // Prepare top sites usage data sorted
  const allSitesNames = Object.keys(usage).filter(k => usage[k] > 0);
  allSitesNames.sort((a, b) => usage[b] - usage[a]);
  const topSites = allSitesNames.slice(0, 5); // Limit to top 5 so popup doesn't overflow

  const colors = ['bg-orange-500', 'bg-blue-400', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500'];

  return (
    <div className="m-0 p-0 w-[350px] bg-white text-slate-900 font-sans shadow-2xl overflow-hidden min-h-[440px]">
      <div className="px-5 w-full h-[440px] overflow-y-auto custom-scrollbar pt-2 text-center block">
        
        {/* Header Mockup */}
        <div className="relative z-10 w-full flex justify-center mb-0">
          <img src="/icons/icon_48x48.png" alt="FocusShield Logo" className="w-[56px] h-[56px] rounded-2xl shadow-sm block" />
        </div>
        <h1 className="text-[36px] font-extrabold text-black tracking-tight leading-[0.7] relative z-20" style={{ margin: 0, padding: 0, marginTop: '10px' }}>
          FocusShield
        </h1>

        {currentDomain && (
          <>
            {/* Current Site Usage Mockup */}
            <div style={{ padding: 0, margin: 0 }}>
              <p className="text-[15px] text-black font-medium uppercase tracking-widest leading-none relative z-20" style={{ margin: 0, padding: 0, marginTop: '20px' }}>
                Current Site
              </p>
              <h2 className="text-[28px] font-extrabold text-black tracking-tight leading-[0.8] relative z-20" style={{ margin: 0, padding: 0, marginTop: '10px' }}>
                {currentDomain}
              </h2>
              <div className="text-[18px] text-black font-medium leading-[0.8]" style={{ margin: 0, padding: 0, marginTop: '15px' }}>
                {formatTime(currentUsageMs)}
              </div>
            </div>

            <hr className="w-[260px] mx-auto border-t border-gray-300 m-0 p-0 mt-2" style={{ marginTop: '10px', marginBottom: '1px' }}/>

            {/* Time Limit Section */}
            <div className="w-full max-w-[260px] mx-auto flex flex-col items-center">
              <h3 className="text-[18px] text-center text-black uppercase font-bold leading-none m-0 p-0 mb-1">
                Time Limit
              </h3>

              {!timer ? (
                <div className="flex items-stretch h-[32px] w-full border border-black bg-white mt-1">
                  <input
                    type="number"
                    placeholder="00:00"
                    className="flex-1 w-0 min-w-0 text-[14px] bg-transparent outline-none text-black placeholder-gray-500 font-medium px-2 no-spin"
                    value={inputMinutes}
                    onChange={(e) => setInputMinutes(e.target.value)}
                  />
                  <button
                    onClick={startTimer}
                    disabled={!inputMinutes}
                    className="px-4 border-l border-black flex items-center justify-center text-black hover:bg-gray-100 disabled:text-gray-400 transition-colors"
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </div>
              ) : (
                <div className="flex items-stretch justify-between h-[32px] w-full bg-white border border-black mt-1">
                  <div className="flex items-center pl-2 gap-2">
                    <Clock className="text-black inline-block" size={16} />
                    <span className="text-[14px] font-medium text-black">
                      {String(timer.minutes).padStart(2, "0")}:{String(timer.seconds).padStart(2, "0")}
                    </span>
                  </div>
                  <button
                    onClick={deleteTimer}
                    title="Remove Limit"
                    className="flex items-center justify-center px-3 border-l border-black text-black hover:bg-gray-200 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* All Sites Usage */}
        <section className="w-full max-w-[260px] mx-auto mt-4">
          <h3 className="text-[18px] text-center text-black uppercase font-bold mb-1">
            Top Usage
          </h3>
          <div className="space-y-1.5 px-2">
            {topSites.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4 bg-gray-50 rounded-lg border border-gray-100">
                No active usage tracking yet.
              </p>
            ) : (
              topSites.map((domain, index) => {
                const spentMs = usage[domain] || 0;
                const colorClass = colors[index % colors.length];
                const maxUsageMs = usage[topSites[0]] || 1;
                const progressPercentage = Math.max(3, (spentMs / maxUsageMs) * 100);

                return (
                  <div key={domain} className="flex flex-col gap-2 group">
                    <div className="flex justify-between text-sm items-center">
                      <span className="flex items-center gap-2 text-slate-700 font-medium group-hover:text-slate-900 transition-colors">
                        <Globe size={14} style={{ minWidth: '14px', flexShrink: 0, marginRight: '8px' }} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                        <span className="truncate max-w-[140px]">{domain}</span>
                      </span>
                      <span className="text-slate-500 font-mono text-xs font-semibold">
                        {formatTime(spentMs)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden shadow-inner">
                      <div
                        className={`${colorClass} h-full rounded-full transition-all duration-1000 ease-out`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;
