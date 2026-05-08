'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, type BuildMode } from '../lib/game';
import type {
  UISnapshot, BuildingType, InfraType, PlacedBuilding, ChatMessage, Resources,
} from '../lib/types';
import {
  BUILDING_DEFS, PLAYER_BUILDING_ORDER, INFRA_COST, INFRA_LABEL,
  RESOURCE_ICONS, RESOURCE_LABELS, AI_DAILY_LIMIT, AI_RESEARCH_COST, CHEAP_MODELS,
} from '../lib/constants';
import { listSaves, deleteSave, type SaveMeta } from '../lib/save';
import {
  parseCommands, executeCommands, stripCommands, summarizeGameState,
} from '../lib/ai-commands';

const HOME_URL = process.env.NEXT_PUBLIC_HOME_URL ?? 'https://zlatkov.ai';

const ZERO: Resources = { capital: 0, compute: 0, energy: 0, data: 0, talent: 0, research: 0 };

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

function fmtRate(n: number): string {
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 100) return `${sign}${n.toFixed(0)}/s`;
  return `${sign}${n.toFixed(1)}/s`;
}

const LS_CHAT_KEY = 'storage_tycoon_chat_key';
const LS_CHAT_MODEL = 'tycoon_chat_model';

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [ui, setUi] = useState<UISnapshot>({
    resources: ZERO, rates: ZERO, day: 1, speed: 1, aiQueriesLeft: AI_DAILY_LIMIT,
  });
  const [selected, setSelected] = useState<PlacedBuilding | null>(null);
  const [mode, setMode] = useState<BuildMode>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // BYOK settings
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState(CHEAP_MODELS[0].id);
  const [customModel, setCustomModel] = useState('');

  // Persist BYOK prefs
  useEffect(() => {
    const saved = localStorage.getItem(LS_CHAT_KEY);
    if (saved) { setUseCustomKey(true); setCustomApiKey(saved); }
    const savedModel = localStorage.getItem(LS_CHAT_MODEL);
    if (savedModel) setSelectedModel(savedModel);
  }, []);

  const saveChatSettings = () => {
    if (useCustomKey && customApiKey) {
      localStorage.setItem(LS_CHAT_KEY, customApiKey);
    } else {
      localStorage.removeItem(LS_CHAT_KEY);
    }
    localStorage.setItem(LS_CHAT_MODEL, selectedModel);
    setShowChatSettings(false);
  };

  // Init game
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const setCanvasSize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      c.style.width = window.innerWidth + 'px';
      c.style.height = window.innerHeight + 'px';
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    const game = new Game(c);
    gameRef.current = game;

    game.onUIUpdate = (s) => setUi(s);
    game.onSelect = (b) => setSelected(b);
    game.onModeChange = (m) => setMode(m);
    game.onMessage = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    };

    game.loadFrom('auto');
    game.start();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      game.stop();
    };
  }, []);

  const setBuildMode = useCallback((m: BuildMode) => {
    gameRef.current?.setBuildMode(m);
  }, []);

  const setSpeed = useCallback((s: 0 | 1 | 2 | 5) => {
    gameRef.current?.setSpeed(s);
  }, []);

  const refreshSaves = useCallback(() => {
    setSaves(listSaves());
  }, []);

  const onSaveClick = (slot: number) => {
    if (!gameRef.current) return;
    gameRef.current.saveTo(slot);
    refreshSaves();
    setToast(`Saved to slot ${slot + 1}`);
    setTimeout(() => setToast(null), 1500);
  };

  const onLoadClick = (slot: number | 'auto') => {
    if (!gameRef.current) return;
    const ok = gameRef.current.loadFrom(slot);
    setToast(ok ? `Loaded ${slot === 'auto' ? 'auto-save' : `slot ${(slot as number) + 1}`}` : 'Load failed');
    setTimeout(() => setToast(null), 1500);
    setShowSaveMenu(false);
  };

  const onResetClick = () => {
    if (!gameRef.current) return;
    if (!confirm('Reset the game? Progress will be lost (auto-save will be overwritten).')) return;
    gameRef.current.reset();
    setShowSaveMenu(false);
    setToast('Game reset');
    setTimeout(() => setToast(null), 1500);
  };

  const sendChat = async () => {
    if (!gameRef.current || !chatInput.trim() || chatLoading) return;
    const game = gameRef.current;
    if (game.state.aiQueriesUsedToday >= AI_DAILY_LIMIT) {
      setChat(c => [...c, { role: 'assistant', content: '⚠ Daily AI query limit reached. Try again tomorrow.' }]);
      setChatInput('');
      return;
    }
    if (game.state.resources.research < AI_RESEARCH_COST) {
      setChat(c => [...c, { role: 'assistant', content: `⚠ Need ${AI_RESEARCH_COST} Research Points (have ${Math.floor(game.state.resources.research)}). Build research labs.` }]);
      setChatInput('');
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const newChat = [...chat, userMsg];
    setChat(newChat);
    setChatInput('');
    setChatLoading(true);

    game.state.resources.research -= AI_RESEARCH_COST;
    game.state.aiQueriesUsedToday += 1;
    game.emitUI();

    // Resolve model: customModel (free-text) > selectedModel dropdown
    const resolvedModel = customModel.trim() || selectedModel;
    const body: Record<string, unknown> = {
      messages: newChat.map(m => ({ role: m.role, content: m.content })),
      gameSummary: summarizeGameState(game),
      model: resolvedModel,
    };
    if (useCustomKey && customApiKey) body.userApiKey = customApiKey;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (data.error || !data.text) {
        setChat(c => [...c, { role: 'assistant', content: `⚠ ${data.error ?? 'No response'}` }]);
      } else {
        const commands = parseCommands(data.text);
        const advice = stripCommands(data.text) || '(executing commands...)';
        let reply = advice;
        if (commands.length > 0) {
          const results = executeCommands(game, commands);
          const summary = results.map(r => (r.ok ? '✓' : '✗') + ' ' + r.msg).join('\n');
          reply = `${advice}\n\n${summary}`;
        }
        setChat(c => [...c, { role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setChat(c => [...c, { role: 'assistant', content: `⚠ ${String(e)}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const selectedDef = selected ? BUILDING_DEFS[selected.type] : null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} />

      {/* Top bar: home + resources */}
      <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-2 fade-in">
        <a
          href={HOME_URL}
          className="chip no-underline opacity-80 hover:opacity-100 transition-opacity"
          style={{ fontSize: 12 }}
        >
          ← Home
        </a>
        <ResourceChip label="Capital" icon={RESOURCE_ICONS.capital} value={ui.resources.capital} rate={ui.rates.capital} prefix="$" big />
        <ResourceChip label="Energy" icon={RESOURCE_ICONS.energy} value={ui.resources.energy} rate={ui.rates.energy} />
        <ResourceChip label="Compute" icon={RESOURCE_ICONS.compute} value={ui.resources.compute} rate={ui.rates.compute} />
        <ResourceChip label="Data" icon={RESOURCE_ICONS.data} value={ui.resources.data} rate={ui.rates.data} />
        <ResourceChip label="Talent" icon={RESOURCE_ICONS.talent} value={ui.resources.talent} rate={ui.rates.talent} />
        <ResourceChip label="Research" icon={RESOURCE_ICONS.research} value={ui.resources.research} rate={ui.rates.research} />
        <div className="flex-1" />
        <span className="chip">Day {ui.day}</span>
      </div>

      {/* Top right: speed + save + help */}
      <div className="absolute top-12 right-2 flex gap-1 fade-in">
        <button className={`btn ${ui.speed === 0 ? 'active' : ''}`} title="Pause (Space)" onClick={() => setSpeed(0)}>⏸</button>
        <button className={`btn ${ui.speed === 1 ? 'active' : ''}`} title="1× (1)" onClick={() => setSpeed(1)}>1×</button>
        <button className={`btn ${ui.speed === 2 ? 'active' : ''}`} title="2× (2)" onClick={() => setSpeed(2)}>2×</button>
        <button className={`btn ${ui.speed === 5 ? 'active' : ''}`} title="5× (3)" onClick={() => setSpeed(5)}>5×</button>
        <button className="btn" onClick={() => { refreshSaves(); setShowSaveMenu(v => !v); }}>💾</button>
        <button className="btn" onClick={() => setShowHelp(v => !v)}>?</button>
      </div>

      {/* Save menu */}
      {showSaveMenu && (
        <div className="absolute top-24 right-2 panel p-3 w-72 fade-in">
          <div className="font-semibold mb-2 text-sm">Save / Load</div>
          {[0, 1, 2].map(slot => {
            const m = saves.find(s => s.slot === slot);
            return (
              <div key={slot} className="flex items-center justify-between gap-2 mb-2 text-xs">
                <div className="flex-1 truncate">
                  <div className="font-medium">Slot {slot + 1}</div>
                  {m ? (
                    <div className="opacity-70">Day {m.day} · ${fmt(m.capital)} · {m.buildings} buildings</div>
                  ) : (
                    <div className="opacity-50">empty</div>
                  )}
                </div>
                <button className="btn" onClick={() => onSaveClick(slot)}>Save</button>
                <button className="btn" disabled={!m} onClick={() => onLoadClick(slot)}>Load</button>
              </div>
            );
          })}
          {saves.find(s => s.slot === 'auto') && (
            <div className="flex items-center justify-between gap-2 mb-2 text-xs">
              <div className="flex-1 truncate">
                <div className="font-medium">Auto-save</div>
                <div className="opacity-70">
                  Day {saves.find(s => s.slot === 'auto')!.day} · ${fmt(saves.find(s => s.slot === 'auto')!.capital)}
                </div>
              </div>
              <button className="btn" onClick={() => onLoadClick('auto')}>Load</button>
            </div>
          )}
          <button className="btn w-full mt-1" style={{ background: 'rgba(127,29,29,0.7)' }} onClick={onResetClick}>Reset Game</button>
        </div>
      )}

      {/* Help overlay */}
      {showHelp && (
        <div className="absolute top-24 right-2 panel p-3 w-80 fade-in text-xs leading-relaxed">
          <div className="font-semibold mb-2 text-sm">Controls</div>
          <div><b>WASD/arrows</b> · pan · <b>scroll/+−</b> zoom</div>
          <div><b>Click</b> place/select · <b>Right-click/Esc</b> cancel</div>
          <div><b>Drag</b> while in road mode to paint</div>
          <div><b>Shift+drag</b> or <b>middle-mouse</b> to pan</div>
          <div><b>Space</b> pause · <b>1/2/3</b> speed</div>
          <div className="mt-2 font-semibold">Goal</div>
          <div>Build the AI economy. Power → Compute → Data → Revenue.</div>
          <div className="mt-2 font-semibold">AI Advisor</div>
          <div>Open the chat (bottom-right). Costs {AI_RESEARCH_COST} 🔬 per query, capped at {AI_DAILY_LIMIT}/day.</div>
        </div>
      )}

      {/* Bottom build panel */}
      <div className="absolute bottom-2 left-2 right-96 panel p-2 fade-in">
        <div className="flex flex-wrap gap-1 mb-1">
          {PLAYER_BUILDING_ORDER.map(t => {
            const def = BUILDING_DEFS[t];
            const isActive = mode?.kind === 'building' && mode.type === t;
            const canAfford = ui.resources.capital >= def.cost;
            return (
              <button
                key={t}
                className={`btn ${isActive ? 'active' : ''}`}
                disabled={!canAfford && !isActive}
                onClick={() => setBuildMode(isActive ? null : { kind: 'building', type: t })}
                title={`${def.name} — ${def.description}\nProduces: ${formatRes(def.produces)}\nConsumes: ${formatRes(def.consumes) || '—'}`}
                style={{ minWidth: 88 }}
              >
                <div className="text-base">{def.icon}</div>
                <div className="text-[11px] leading-tight">{def.name}</div>
                <div className="text-[10px] opacity-70">${def.cost}</div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['road', 'railway', 'power_line'] as InfraType[]).map(t => {
            const isActive = mode?.kind === 'infra' && mode.type === t;
            return (
              <button
                key={t}
                className={`btn ${isActive ? 'active' : ''}`}
                onClick={() => setBuildMode(isActive ? null : { kind: 'infra', type: t })}
                title={`${INFRA_LABEL[t]} — $${INFRA_COST[t]}/tile · drag to paint`}
              >
                {INFRA_LABEL[t]} <span className="opacity-70">${INFRA_COST[t]}/t</span>
              </button>
            );
          })}
          <button
            className={`btn ${mode?.kind === 'demolish' ? 'active' : ''}`}
            onClick={() => setBuildMode(mode?.kind === 'demolish' ? null : { kind: 'demolish' })}
            title="Demolish — 50% refund on buildings"
            style={{ background: mode?.kind === 'demolish' ? '#991b1b' : undefined }}
          >
            🔨 Demolish
          </button>
        </div>
      </div>

      {/* Right side info panel */}
      {selected && selectedDef && (
        <div className="absolute top-24 right-2 panel p-3 w-80 fade-in" style={{ marginTop: 80 }}>
          <div className="flex items-start gap-3">
            <div className="text-3xl">{selectedDef.icon}</div>
            <div className="flex-1">
              <div className="font-semibold">{selectedDef.name}</div>
              <div className="text-xs opacity-70">{selectedDef.description}</div>
              <div className="text-xs mt-1">
                <span className={selected.operational ? 'text-green-400' : 'text-zinc-400'}>
                  {selected.operational ? '● Operational' : '○ Idle (missing inputs)'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs space-y-1">
            <div>📍 ({selected.x}, {selected.y}) · {selectedDef.size}×{selectedDef.size}</div>
            {Object.keys(selectedDef.produces).length > 0 && (
              <div><b>Produces:</b> {formatRes(selectedDef.produces)}</div>
            )}
            {Object.keys(selectedDef.consumes).length > 0 && (
              <div><b>Consumes:</b> {formatRes(selectedDef.consumes)}</div>
            )}
          </div>
          {selected.type !== 'hq' && !selected.builtin && (
            <button
              className="btn mt-3 w-full"
              style={{ background: 'rgba(127,29,29,0.7)' }}
              onClick={() => {
                gameRef.current?.tryDemolish(selected.x, selected.y);
                setSelected(null);
              }}
            >
              🔨 Demolish (refund ${Math.floor(selectedDef.cost * 0.5)})
            </button>
          )}
        </div>
      )}

      {/* AI chat (bottom-right) */}
      <div className="absolute bottom-2 right-2 fade-in" style={{ width: 380 }}>
        {chatOpen ? (
          <div className="panel flex flex-col" style={{ height: showChatSettings ? 520 : 380 }}>
            <div className="flex items-center justify-between p-2 border-b border-white/10">
              <div className="text-sm font-semibold">🤖 AI Advisor</div>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span>{ui.aiQueriesLeft}/{AI_DAILY_LIMIT} left</span>
                <span>·</span>
                <span>{AI_RESEARCH_COST}🔬/query</span>
                <button
                  className={`btn px-2 py-0.5 ${showChatSettings ? 'active' : ''}`}
                  title="AI settings"
                  onClick={() => setShowChatSettings(v => !v)}
                >⚙</button>
                <button className="btn px-2 py-0.5" onClick={() => setChatOpen(false)}>×</button>
              </div>
            </div>

            {/* Settings drawer */}
            {showChatSettings && (
              <div className="p-3 border-b border-white/10 text-xs space-y-2">
                <div className="font-semibold text-sm mb-1">AI Settings</div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomKey}
                    onChange={e => setUseCustomKey(e.target.checked)}
                  />
                  Use my own OpenRouter API key (BYOK)
                </label>

                {useCustomKey && (
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={e => setCustomApiKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono"
                  />
                )}

                <div>
                  <div className="opacity-70 mb-1">Model preset</div>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1 outline-none"
                  >
                    {CHEAP_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="opacity-70 mb-1">Custom model ID (overrides preset)</div>
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="e.g. anthropic/claude-3-5-haiku"
                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1 outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {!useCustomKey && (
                  <div className="opacity-60 italic">Using server-side OpenRouter key (default).</div>
                )}

                <button className="btn w-full" onClick={saveChatSettings}>Save settings</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin space-y-2 text-xs">
              {chat.length === 0 && (
                <div className="opacity-60 italic">
                  Ask for advice or actions. Examples:
                  <ul className="list-disc pl-4 mt-1 not-italic opacity-90">
                    <li>"Build a power plant near my HQ"</li>
                    <li>"Connect all my buildings with roads"</li>
                    <li>"What should I build next?"</li>
                  </ul>
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`p-2 rounded ${m.role === 'user' ? 'bg-blue-900/40' : 'bg-zinc-800/60'}`}>
                  <div className="text-[10px] opacity-60 mb-0.5">{m.role === 'user' ? 'You' : 'AI'}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
              {chatLoading && <div className="opacity-60 italic">thinking…</div>}
            </div>
            <div className="p-2 border-t border-white/10 flex gap-1">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="What should I do?"
                className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                disabled={chatLoading}
              />
              <button className="btn" disabled={chatLoading || !chatInput.trim()} onClick={sendChat}>Send</button>
            </div>
          </div>
        ) : (
          <button className="btn w-full" onClick={() => setChatOpen(true)}>
            🤖 AI Advisor ({ui.aiQueriesLeft}/{AI_DAILY_LIMIT})
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 panel px-4 py-2 fade-in text-sm" style={{ top: 60 }}>
          {toast}
        </div>
      )}

      {/* Mode hint */}
      {mode && (
        <div className="absolute left-1/2 -translate-x-1/2 panel px-3 py-1 text-xs fade-in" style={{ bottom: 130 }}>
          {mode.kind === 'building' && `Click to place ${BUILDING_DEFS[mode.type].name}. Right-click or Esc to cancel.`}
          {mode.kind === 'infra' && `Click & drag to paint ${INFRA_LABEL[mode.type]}. Right-click or Esc to cancel.`}
          {mode.kind === 'demolish' && `Click to demolish. Right-click or Esc to cancel.`}
        </div>
      )}
    </div>
  );
}

function ResourceChip({ label, icon, value, rate, prefix = '', big = false }: {
  label: string; icon: string; value: number; rate: number; prefix?: string; big?: boolean;
}) {
  const rateColor = rate > 0 ? 'text-green-400' : rate < 0 ? 'text-red-400' : 'opacity-60';
  return (
    <div className="chip" title={label} style={big ? { fontSize: 14 } : undefined}>
      <span>{icon}</span>
      <span className="font-semibold">{prefix}{fmt(value)}</span>
      <span className={`text-[11px] ${rateColor}`}>{fmtRate(rate)}</span>
    </div>
  );
}

function formatRes(r: Partial<Resources>): string {
  return Object.entries(r)
    .map(([k, v]) => `${RESOURCE_ICONS[k]}${v && v >= 0 ? '+' : ''}${v}/s`)
    .join(' ');
}
