import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.DATA_DIR ?? join(import.meta.dir, 'data')
mkdirSync(dir, { recursive: true })

/** One process owns this file: the HTTP server and the settlement worker share it. */
export const db = new Database(join(dir, 'clickpot.db'))
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;')

db.exec(`
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  image_url TEXT NOT NULL,
  requirements TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  campaign_id INTEGER NOT NULL,
  creator TEXT NOT NULL,
  handle TEXT NOT NULL,
  platform TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  audience TEXT NOT NULL,
  note TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, creator)
);
CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  creator TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (campaign_id, creator)
);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  creator TEXT NOT NULL,
  visitor TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  batch_id TEXT
);
CREATE INDEX IF NOT EXISTS clicks_status ON clicks (status, campaign_id, creator);
CREATE INDEX IF NOT EXISTS clicks_code_ts ON clicks (code, ts);
CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  creator TEXT NOT NULL,
  clicks INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS settlements_creator ON settlements (creator, ts);
`)

export interface CampaignRow {
  id: number
  owner: string
  title: string
  tagline: string
  description: string
  category: string
  destination_url: string
  image_url: string
  requirements: string
  created_at: number
}

export interface ApplicationRow {
  campaign_id: number
  creator: string
  handle: string
  platform: string
  profile_url: string
  audience: string
  note: string
  dismissed: number
  created_at: number
}

export interface LinkRow {
  code: string
  campaign_id: number
  creator: string
  created_at: number
}

const DAY = 86_400_000

export const queries = {
  campaign: (id: number) => db.query('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | null,
  campaigns: (owner?: string) =>
    (owner
      ? db.query('SELECT * FROM campaigns WHERE owner = ? ORDER BY id DESC').all(owner)
      : db.query('SELECT * FROM campaigns ORDER BY id DESC').all()) as CampaignRow[],
  link: (code: string) => db.query('SELECT * FROM links WHERE code = ?').get(code) as LinkRow | null,
  linkFor: (campaignId: number, creator: string) =>
    db.query('SELECT * FROM links WHERE campaign_id = ? AND creator = ?').get(campaignId, creator) as LinkRow | null,
  linksOf: (creator: string) =>
    db.query('SELECT * FROM links WHERE creator = ? ORDER BY created_at DESC').all(creator) as LinkRow[],
  application: (campaignId: number, creator: string) =>
    db
      .query('SELECT * FROM applications WHERE campaign_id = ? AND creator = ?')
      .get(campaignId, creator) as ApplicationRow | null,
  applicationsFor: (campaignId: number) =>
    db
      .query('SELECT * FROM applications WHERE campaign_id = ? ORDER BY created_at DESC')
      .all(campaignId) as ApplicationRow[],
  applicationsOf: (creator: string) =>
    db
      .query('SELECT * FROM applications WHERE creator = ? ORDER BY created_at DESC')
      .all(creator) as ApplicationRow[],
  unlinkedApplications: () =>
    db
      .query(
        `SELECT a.* FROM applications a
         LEFT JOIN links l ON l.campaign_id = a.campaign_id AND l.creator = a.creator
         WHERE l.code IS NULL AND a.dismissed = 0 LIMIT 100`,
      )
      .all() as ApplicationRow[],

  /** Clicks that count toward a campaign (anything not dropped). */
  campaignClicks: (id: number) =>
    (db.query("SELECT COUNT(*) n FROM clicks WHERE campaign_id = ? AND status != 'dropped'").get(id) as { n: number }).n,
  campaignInFlight: (id: number) =>
    (
      db
        .query("SELECT COUNT(*) n FROM clicks WHERE campaign_id = ? AND status IN ('pending','batched')")
        .get(id) as { n: number }
    ).n,
  campaignPartners: (id: number) =>
    (db.query('SELECT COUNT(*) n FROM links WHERE campaign_id = ?').get(id) as { n: number }).n,
  campaignViews: (id: number) =>
    (
      db
        .query('SELECT COUNT(*) n FROM views WHERE code IN (SELECT code FROM links WHERE campaign_id = ?)')
        .get(id) as { n: number }
    ).n,
  campaignPaid: (id: number) =>
    (db.query('SELECT COALESCE(SUM(amount),0) n FROM settlements WHERE campaign_id = ?').get(id) as { n: number }).n,

  /** Daily valid-click counts for the last `days` days, oldest first, zero-filled. */
  dailyClicks: (id: number | null, creator: string | null, days: number) => {
    const since = Date.now() - days * DAY
    const rows = db
      .query(
        `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') d, COUNT(*) n FROM clicks
         WHERE ts >= ? AND status != 'dropped'
           AND (? IS NULL OR campaign_id = ?) AND (? IS NULL OR creator = ?)
         GROUP BY d`,
      )
      .all(since, id, id, creator, creator) as { d: string; n: number }[]
    const byDay = new Map(rows.map((r) => [r.d, r.n]))
    const out: { day: string; clicks: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10)
      out.push({ day, clicks: byDay.get(day) ?? 0 })
    }
    return out
  },

  linkStats: (code: string) => {
    const clicks = db.query("SELECT COUNT(*) n FROM clicks WHERE code = ? AND status != 'dropped'").get(code) as { n: number }
    const pending = db
      .query("SELECT COUNT(*) n FROM clicks WHERE code = ? AND status IN ('pending','batched')")
      .get(code) as { n: number }
    const views = db.query('SELECT COUNT(*) n FROM views WHERE code = ?').get(code) as { n: number }
    const earned = db
      .query(
        `SELECT COALESCE(SUM(s.amount),0) n FROM settlements s
         JOIN links l ON l.campaign_id = s.campaign_id AND l.creator = s.creator WHERE l.code = ?`,
      )
      .get(code) as { n: number }
    return { clicks: clicks.n, pending: pending.n, views: views.n, earned: earned.n }
  },

  creatorsOfCampaign: (id: number) =>
    db
      .query(
        `SELECT l.creator, l.code,
           (SELECT COUNT(*) FROM clicks c WHERE c.code = l.code AND c.status != 'dropped') clicks,
           (SELECT COALESCE(SUM(amount),0) FROM settlements s WHERE s.campaign_id = l.campaign_id AND s.creator = l.creator) paid
         FROM links l WHERE l.campaign_id = ? ORDER BY clicks DESC`,
      )
      .all(id) as { creator: string; code: string; clicks: number; paid: number }[],

  creatorTotals: (creator: string) => ({
    earned: (
      db.query('SELECT COALESCE(SUM(amount),0) n FROM settlements WHERE creator = ?').get(creator) as { n: number }
    ).n,
    clicks: (
      db
        .query("SELECT COUNT(*) n FROM clicks WHERE creator = ? AND status != 'dropped'")
        .get(creator) as { n: number }
    ).n,
  }),
  creatorInFlight: (creator: string, campaignId: number | null = null) =>
    db
      .query(
        `SELECT campaign_id, COUNT(*) n FROM clicks WHERE creator = ? AND status IN ('pending','batched')
         AND (? IS NULL OR campaign_id = ?) GROUP BY campaign_id`,
      )
      .all(creator, campaignId, campaignId) as { campaign_id: number; n: number }[],

  payoutsOf: (creator: string, limit = 25) =>
    db
      .query('SELECT * FROM settlements WHERE creator = ? ORDER BY id DESC LIMIT ?')
      .all(creator, limit) as {
      id: number
      batch_id: string
      campaign_id: number
      creator: string
      clicks: number
      amount: number
      tx_hash: string
      ts: number
    }[],
  recentPayouts: (limit = 12) =>
    db
      .query(
        `SELECT s.*, c.title FROM settlements s LEFT JOIN campaigns c ON c.id = s.campaign_id
         ORDER BY s.id DESC LIMIT ?`,
      )
      .all(limit) as {
      id: number
      campaign_id: number
      creator: string
      clicks: number
      amount: number
      tx_hash: string
      ts: number
      title: string | null
    }[],

  globalTotals: () => ({
    campaigns: (db.query('SELECT COUNT(*) n FROM campaigns').get() as { n: number }).n,
    clicks: (db.query("SELECT COUNT(*) n FROM clicks WHERE status = 'settled'").get() as { n: number }).n,
    paid: (db.query('SELECT COALESCE(SUM(amount),0) n FROM settlements').get() as { n: number }).n,
    creators: (db.query('SELECT COUNT(DISTINCT creator) n FROM links').get() as { n: number }).n,
  }),
}
