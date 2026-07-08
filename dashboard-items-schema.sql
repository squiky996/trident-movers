-- Trident Movers — Owner Dashboard: dashboard_items table
-- ------------------------------------------------------------
-- Backs both the quote-lead notifications and the AI chat agent's
-- draft-reply approval queue. Matches the columns used in
-- dashboard-routes.js and the payload shape from notifyOwnerDashboard().

CREATE TABLE IF NOT EXISTS dashboard_items (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(50)  NOT NULL,   -- 'quote_lead' | 'chat_reply_draft'
  source      VARCHAR(50)  NOT NULL,   -- 'website_form' | 'chat_widget'
  status      VARCHAR(20)  NOT NULL DEFAULT 'unread',  -- 'unread' | 'read'
  payload     JSONB        NOT NULL,   -- flexible per-type data (name, phone, draft text, etc)
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Speeds up the main dashboard query: WHERE status = 'unread' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_dashboard_items_status_created
  ON dashboard_items (status, created_at DESC);

-- Optional: speeds up filtering by type if you later split the feed
-- into separate tabs (e.g. "Leads" vs "Chat Approvals")
CREATE INDEX IF NOT EXISTS idx_dashboard_items_type
  ON dashboard_items (type);
