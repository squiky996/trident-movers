import React, { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// TRIDENT MOVERS — AI CHAT AGENT (human-in-the-loop)
// Two views in one artifact: Customer Widget + Owner Dashboard
// ============================================================

// ---- PLACEHOLDER BUSINESS KNOWLEDGE ----
// ⚠️ SQUIKY: Replace everything in this block with your real info.
const BUSINESS_INFO = `
You are a friendly assistant for Trident Movers, a local residential moving company.

SERVICES (placeholder — replace with real offerings):
- Local residential moves (studio to 5-bedroom homes)
- Packing & unpacking services
- Furniture disassembly/reassembly
- Short-term storage
- Last-minute / same-week moves

SERVICE AREA (placeholder):
- We currently serve the greater metro area within a 50-mile radius.

PRICING (placeholder — DO NOT quote exact final prices, only ranges):
- Studio/1BR: starting around $XXX
- 2-3BR: starting around $XXX
- 4BR+: custom quote
- Hourly rate: $XX/hour for a 2-person crew (placeholder)
Always make clear that final pricing depends on a full assessment and the human team will confirm.

CONTACT:
- Phone: +254 735 393874
- We respond to quote requests within 24 hours.

TONE: Warm, approachable, confident — never pushy. We're proud of being careful with people's belongings and treating every move like it's our own.
`;

const SYSTEM_PROMPT = `${BUSINESS_INFO}

You are drafting a reply to a customer message in a live chat. Rules:
- Keep replies short (2-4 sentences), warm, and specific to what they asked.
- If they ask for an exact final price, give a realistic placeholder RANGE and say a team member will confirm specifics.
- If they want to book or need a firm commitment, collect (if missing): name, moving date, origin/destination area, rough home size. Don't invent details they haven't given.
- Never invent availability, exact dates, or guarantees you don't have info for.
- This draft will be reviewed by the business owner before sending — write it as the final customer-facing message itself, not a note to the owner.
`;

// ---- STORAGE HELPERS ----
const SESSION_KEY_PREFIX = "tm_session_";
const SESSIONS_INDEX_KEY = "tm_sessions_index";

function newSessionId() {
  return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function loadSessionsIndex() {
  try {
    const res = await window.storage.get(SESSIONS_INDEX_KEY, true);
    return res ? JSON.parse(res.value) : [];
  } catch {
    return [];
  }
}

async function saveSessionsIndex(ids) {
  try {
    await window.storage.set(SESSIONS_INDEX_KEY, JSON.stringify(ids), true);
  } catch (e) {
    console.error("Failed to save sessions index", e);
  }
}

async function loadSession(sessionId) {
  try {
    const res = await window.storage.get(SESSION_KEY_PREFIX + sessionId, true);
    return res ? JSON.parse(res.value) : null;
  } catch {
    return null;
  }
}

async function saveSession(sessionId, data) {
  try {
    await window.storage.set(SESSION_KEY_PREFIX + sessionId, JSON.stringify(data), true);
  } catch (e) {
    console.error("Failed to save session", e);
  }
}

// ---- AI DRAFT GENERATION ----
async function generateDraftReply(conversationHistory) {
  try {
    const messages = conversationHistory
      .filter((m) => m.role === "customer" || m.role === "assistant_sent")
      .map((m) => ({
        role: m.role === "customer" ? "user" : "assistant",
        content: m.text,
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: messages.length ? messages : [{ role: "user", content: "Hello" }],
      }),
    });
    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    return textBlock ? textBlock.text : "Thanks for reaching out! A team member will follow up shortly.";
  } catch (e) {
    console.error("Draft generation failed", e);
    return "Thanks for reaching out! A team member will follow up shortly.";
  }
}

// ---- ICONS ----
const TridentIcon = ({ size = 24, color = "#C9A227" }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <path
      d="M24 6 L24 30 M14 6 L14 16 Q14 22 24 22 Q34 22 34 16 L34 6 M12 6 L16 6 M22 6 L26 6 M32 6 L36 6 M24 30 L18 42 M24 30 L30 42"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M3 11L21 3L13 21L11 13L3 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

// ---- THINKING INDICATOR ----
const ThinkingTrident = () => (
  <div className="tm-thinking">
    <div className="tm-thinking-icon">
      <TridentIcon size={16} color="#C9A227" />
    </div>
    <span>thinking</span>
    <span className="tm-dots">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  </div>
);

// ============================================================
// CUSTOMER WIDGET
// ============================================================
function CustomerWidget({ sessionId }) {
  const [open, setOpen] = useState(true);
  const [session, setSession] = useState(null);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef(null);
  const scrollRef = useRef(null);

  const refresh = useCallback(async () => {
    const s = await loadSession(sessionId);
    setSession(s);
  }, [sessionId]);

  useEffect(() => {
    (async () => {
      let s = await loadSession(sessionId);
      if (!s) {
        s = { id: sessionId, createdAt: Date.now(), messages: [], status: "active" };
        await saveSession(sessionId, s);
        const idx = await loadSessionsIndex();
        if (!idx.includes(sessionId)) await saveSessionsIndex([...idx, sessionId]);
      }
      setSession(s);
    })();

    pollRef.current = setInterval(refresh, 2500);
    return () => clearInterval(pollRef.current);
  }, [sessionId, refresh]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session]);

  const sendMessage = async () => {
    if (!input.trim() || !session) return;
    const text = input.trim();
    setInput("");
    setWaiting(true);

    const newMsg = { id: Date.now(), role: "customer", text, ts: Date.now() };
    const updated = { ...session, messages: [...session.messages, newMsg], status: "awaiting_draft" };
    setSession(updated);
    await saveSession(sessionId, updated);

    const draft = await generateDraftReply(updated.messages);
    const draftMsg = { id: Date.now() + 1, role: "draft", text: draft, ts: Date.now(), approved: false };
    const withDraft = { ...updated, messages: [...updated.messages, draftMsg], status: "awaiting_approval" };
    await saveSession(sessionId, withDraft);
    setSession(withDraft);
    setWaiting(false);
  };

  if (!session) return null;

  const visibleMessages = session.messages.filter((m) => m.role !== "draft" || m.approved);
  const hasPendingDraft = session.messages.some((m) => m.role === "draft" && !m.approved && !m.rejected);

  return (
    <div className="tm-widget-root">
      {!open && (
        <button className="tm-launcher" onClick={() => setOpen(true)} aria-label="Open chat">
          <TridentIcon size={26} color="#F5F0E1" />
        </button>
      )}

      {open && (
        <div className="tm-panel">
          <div className="tm-panel-header">
            <div className="tm-header-left">
              <TridentIcon size={20} color="#C9A227" />
              <div>
                <div className="tm-header-title">Trident Movers</div>
                <div className="tm-header-sub">We usually reply within a day</div>
              </div>
            </div>
            <button className="tm-close-btn" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>

          <div className="tm-messages" ref={scrollRef}>
            {visibleMessages.length === 0 && (
              <div className="tm-welcome">
                👋 Hi there! Tell us a bit about your move — where you're headed and roughly when — and we'll get you sorted.
              </div>
            )}
            {visibleMessages.map((m) => (
              <div key={m.id} className={`tm-bubble-row ${m.role === "customer" ? "tm-row-customer" : "tm-row-team"}`}>
                <div className={`tm-bubble ${m.role === "customer" ? "tm-bubble-customer" : "tm-bubble-team"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {hasPendingDraft && (
              <div className="tm-bubble-row tm-row-team">
                <div className="tm-pending-note">
                  <TridentIcon size={14} color="#8a8a8a" />
                  Squiky is reviewing your message and will reply shortly
                </div>
              </div>
            )}
            {waiting && (
              <div className="tm-bubble-row tm-row-team">
                <ThinkingTrident />
              </div>
            )}
          </div>

          <div className="tm-input-row">
            <input
              className="tm-input"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="tm-send-btn" onClick={sendMessage} aria-label="Send">
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// OWNER DASHBOARD
// ============================================================
function OwnerDashboard() {
  const [sessionIds, setSessionIds] = useState([]);
  const [sessions, setSessions] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingDraftId, setEditingDraftId] = useState(null);
  const pollRef = useRef(null);

  const refreshAll = useCallback(async () => {
    const ids = await loadSessionsIndex();
    setSessionIds(ids);
    const entries = await Promise.all(ids.map(async (id) => [id, await loadSession(id)]));
    const map = {};
    entries.forEach(([id, s]) => {
      if (s) map[id] = s;
    });
    setSessions(map);
  }, []);

  useEffect(() => {
    refreshAll();
    pollRef.current = setInterval(refreshAll, 2500);
    return () => clearInterval(pollRef.current);
  }, [refreshAll]);

  useEffect(() => {
    if (!activeId && sessionIds.length > 0) setActiveId(sessionIds[0]);
  }, [sessionIds, activeId]);

  const activeSession = activeId ? sessions[activeId] : null;

  const startEditing = (draft) => {
    setEditingDraftId(draft.id);
    setEditingText(draft.text);
  };

  const sendDraft = async (finalText) => {
    if (!activeSession) return;
    const updatedMessages = activeSession.messages.map((m) =>
      m.role === "draft" && !m.approved
        ? { ...m, role: "assistant_sent", text: finalText, approved: true }
        : m
    );
    const updated = { ...activeSession, messages: updatedMessages, status: "active" };
    await saveSession(activeId, updated);
    setSessions((prev) => ({ ...prev, [activeId]: updated }));
    setEditingDraftId(null);
    setEditingText("");
  };

  const discardDraft = async (draftId) => {
    if (!activeSession) return;
    const updatedMessages = activeSession.messages.map((m) =>
      m.id === draftId ? { ...m, rejected: true } : m
    );
    const updated = { ...activeSession, messages: updatedMessages };
    await saveSession(activeId, updated);
    setSessions((prev) => ({ ...prev, [activeId]: updated }));
  };

  const pendingCount = (s) => s.messages.filter((m) => m.role === "draft" && !m.approved && !m.rejected).length;

  return (
    <div className="tm-dash-root">
      <div className="tm-dash-sidebar">
        <div className="tm-dash-sidebar-header">
          <TridentIcon size={20} color="#C9A227" />
          <span>Conversations</span>
        </div>
        {sessionIds.length === 0 && <div className="tm-dash-empty">No conversations yet.</div>}
        {sessionIds.map((id) => {
          const s = sessions[id];
          if (!s) return null;
          const pending = pendingCount(s);
          const last = s.messages[s.messages.length - 1];
          return (
            <button
              key={id}
              className={`tm-dash-conv-item ${activeId === id ? "tm-active" : ""}`}
              onClick={() => setActiveId(id)}
            >
              <div className="tm-dash-conv-top">
                <span className="tm-dash-conv-id">Visitor {id.slice(-4)}</span>
                {pending > 0 && <span className="tm-pending-badge">{pending}</span>}
              </div>
              <div className="tm-dash-conv-preview">{last ? last.text.slice(0, 50) : "—"}</div>
            </button>
          );
        })}
      </div>

      <div className="tm-dash-main">
        {!activeSession && <div className="tm-dash-empty-main">Select a conversation</div>}
        {activeSession && (
          <>
            <div className="tm-dash-thread">
              {activeSession.messages
                .filter((m) => !m.rejected)
                .map((m) => (
                  <div key={m.id} className={`tm-dash-msg-block tm-dash-role-${m.role}`}>
                    <div className="tm-dash-msg-label">
                      {m.role === "customer" ? "Customer" : m.role === "draft" ? "AI draft (pending review)" : "Sent to customer"}
                    </div>

                    {m.role === "draft" && !m.approved ? (
                      editingDraftId === m.id ? (
                        <div className="tm-draft-editor">
                          <textarea
                            className="tm-draft-textarea"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={4}
                          />
                          <div className="tm-draft-actions">
                            <button className="tm-btn tm-btn-primary" onClick={() => sendDraft(editingText)}>
                              Send edited reply
                            </button>
                            <button className="tm-btn tm-btn-ghost" onClick={() => setEditingDraftId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="tm-draft-card">
                          <div className="tm-draft-text">{m.text}</div>
                          <div className="tm-draft-actions">
                            <button className="tm-btn tm-btn-primary" onClick={() => sendDraft(m.text)}>
                              ✓ Approve & send
                            </button>
                            <button className="tm-btn tm-btn-ghost" onClick={() => startEditing(m)}>
                              Edit
                            </button>
                            <button className="tm-btn tm-btn-danger" onClick={() => discardDraft(m.id)}>
                              Discard
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="tm-dash-msg-text">{m.text}</div>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ROOT APP — toggles between views
// ============================================================
export default function App() {
  const [view, setView] = useState("customer");
  const [sessionId] = useState(() => {
    const existing = sessionStorage_safe_get("tm_current_session");
    if (existing) return existing;
    const id = newSessionId();
    sessionStorage_safe_set("tm_current_session", id);
    return id;
  });

  // Simple in-memory fallback since we can't use real sessionStorage per artifact rules —
  // session id just regenerates per load, which is fine for demo purposes.
  function sessionStorage_safe_get() {
    return null;
  }
  function sessionStorage_safe_set() {}

  return (
    <div className="tm-app">
      <style>{CSS}</style>

      <div className="tm-view-toggle">
        <button
          className={`tm-toggle-btn ${view === "customer" ? "tm-toggle-active" : ""}`}
          onClick={() => setView("customer")}
        >
          Customer View
        </button>
        <button
          className={`tm-toggle-btn ${view === "owner" ? "tm-toggle-active" : ""}`}
          onClick={() => setView("owner")}
        >
          Owner Dashboard
        </button>
      </div>

      <div className="tm-stage">
        {view === "customer" ? (
          <div className="tm-stage-customer">
            <CustomerWidget sessionId={sessionId} />
          </div>
        ) : (
          <OwnerDashboard />
        )}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap');

:root {
  --tm-green: #0F3D2E;
  --tm-green-light: #15523F;
  --tm-gold: #C9A227;
  --tm-cream: #F5F0E1;
  --tm-sage: #E8EDE5;
  --tm-ink: #1A1A1A;
  --tm-muted: #6b6b6b;
}

.tm-app {
  font-family: 'Source Sans 3', sans-serif;
  color: var(--tm-ink);
  min-height: 100%;
  background: #fafaf7;
  position: relative;
}

.tm-view-toggle {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--tm-green);
}

.tm-toggle-btn {
  font-family: 'Source Sans 3', sans-serif;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid rgba(201,162,39,0.4);
  background: transparent;
  color: rgba(245,240,225,0.7);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tm-toggle-btn:hover { border-color: var(--tm-gold); color: var(--tm-cream); }
.tm-toggle-active {
  background: var(--tm-gold);
  color: var(--tm-green);
  border-color: var(--tm-gold);
}

.tm-stage { position: relative; min-height: 560px; }
.tm-stage-customer {
  position: relative;
  min-height: 560px;
  background: linear-gradient(135deg, #f0ede2 0%, #e9e4d4 100%);
}

/* ---- Launcher ---- */
.tm-launcher {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--tm-green);
  border: 2px solid var(--tm-gold);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(15,61,46,0.35);
  transition: transform 0.15s ease;
}
.tm-launcher:hover { transform: scale(1.06); }

/* ---- Panel ---- */
.tm-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 340px;
  height: 480px;
  background: var(--tm-cream);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(15,61,46,0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(201,162,39,0.3);
}

.tm-panel-header {
  background: var(--tm-green);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tm-header-left { display: flex; align-items: center; gap: 10px; }
.tm-header-title {
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  font-size: 16px;
  color: var(--tm-cream);
  line-height: 1.1;
}
.tm-header-sub { font-size: 11px; color: rgba(245,240,225,0.65); margin-top: 2px; }
.tm-close-btn {
  background: none;
  border: none;
  color: var(--tm-cream);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.tm-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tm-welcome {
  font-size: 13.5px;
  color: var(--tm-muted);
  background: var(--tm-sage);
  border-radius: 10px;
  padding: 12px 14px;
  line-height: 1.5;
}

.tm-bubble-row { display: flex; }
.tm-row-customer { justify-content: flex-end; }
.tm-row-team { justify-content: flex-start; }

.tm-bubble {
  max-width: 78%;
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.45;
}
.tm-bubble-customer { background: var(--tm-green); color: var(--tm-cream); border-bottom-right-radius: 3px; }
.tm-bubble-team { background: var(--tm-sage); color: var(--tm-ink); border-bottom-left-radius: 3px; }

.tm-pending-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--tm-muted);
  font-style: italic;
  padding: 4px 2px;
}

.tm-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tm-muted);
  padding: 6px 4px;
}
.tm-thinking-icon { animation: tm-spin 1.4s linear infinite; display: flex; }
@keyframes tm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.tm-dots span { animation: tm-blink 1.2s infinite; opacity: 0.2; }
.tm-dots span:nth-child(2) { animation-delay: 0.2s; }
.tm-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes tm-blink { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }

.tm-input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(15,61,46,0.12);
  background: #fffdf8;
}
.tm-input {
  flex: 1;
  border: 1px solid rgba(15,61,46,0.2);
  border-radius: 20px;
  padding: 9px 14px;
  font-size: 13px;
  font-family: 'Source Sans 3', sans-serif;
  outline: none;
  background: white;
}
.tm-input:focus { border-color: var(--tm-gold); }
.tm-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--tm-green);
  color: var(--tm-gold);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.tm-send-btn:hover { background: var(--tm-green-light); }

/* ---- Owner Dashboard ---- */
.tm-dash-root {
  display: flex;
  height: 560px;
  background: white;
}

.tm-dash-sidebar {
  width: 260px;
  border-right: 1px solid #e8e4d8;
  background: #fcfbf7;
  overflow-y: auto;
  flex-shrink: 0;
}
.tm-dash-sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--tm-green);
  border-bottom: 1px solid #e8e4d8;
}
.tm-dash-empty { padding: 20px 16px; font-size: 13px; color: var(--tm-muted); }
.tm-dash-conv-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  border: none;
  background: none;
  border-bottom: 1px solid #f0ede2;
  cursor: pointer;
}
.tm-dash-conv-item:hover { background: #f5f2e8; }
.tm-active { background: var(--tm-sage); border-left: 3px solid var(--tm-gold); }
.tm-dash-conv-top { display: flex; justify-content: space-between; align-items: center; }
.tm-dash-conv-id { font-size: 13px; font-weight: 600; color: var(--tm-ink); }
.tm-pending-badge {
  background: var(--tm-gold);
  color: var(--tm-green);
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}
.tm-dash-conv-preview {
  font-size: 12px;
  color: var(--tm-muted);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-dash-main { flex: 1; overflow-y: auto; padding: 24px; }
.tm-dash-empty-main { color: var(--tm-muted); font-size: 14px; padding: 40px; text-align: center; }

.tm-dash-thread { display: flex; flex-direction: column; gap: 16px; max-width: 620px; }
.tm-dash-msg-block { }
.tm-dash-msg-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tm-muted);
  margin-bottom: 5px;
}
.tm-dash-role-draft .tm-dash-msg-label { color: var(--tm-gold); }
.tm-dash-msg-text {
  background: #f5f3ea;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.5;
}
.tm-dash-role-customer .tm-dash-msg-text { background: var(--tm-sage); }
.tm-dash-role-assistant_sent .tm-dash-msg-text { background: #e9f2ec; }

.tm-draft-card {
  background: #fff9e8;
  border: 1px solid rgba(201,162,39,0.4);
  border-radius: 8px;
  padding: 12px 14px;
}
.tm-draft-text { font-size: 13.5px; line-height: 1.5; margin-bottom: 10px; }
.tm-draft-editor { background: #fff9e8; border: 1px solid rgba(201,162,39,0.4); border-radius: 8px; padding: 12px; }
.tm-draft-textarea {
  width: 100%;
  font-family: 'Source Sans 3', sans-serif;
  font-size: 13.5px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  resize: vertical;
  margin-bottom: 10px;
  box-sizing: border-box;
}
.tm-draft-actions { display: flex; gap: 8px; }
.tm-btn {
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 13px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-family: 'Source Sans 3', sans-serif;
}
.tm-btn-primary { background: var(--tm-green); color: var(--tm-cream); }
.tm-btn-primary:hover { background: var(--tm-green-light); }
.tm-btn-ghost { background: transparent; color: var(--tm-green); border: 1px solid var(--tm-green); }
.tm-btn-danger { background: transparent; color: #a33; border: 1px solid #a33; }
`;
