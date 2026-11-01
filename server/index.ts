import { createHash } from 'node:crypto'
import { join, normalize } from 'node:path'
import { isAddress, recoverMessageAddress, type Address, type Hex } from 'viem'
import {
  applyMessage,
  CATEGORIES,
  contentHash,
  dismissMessage,
  PLATFORMS,
  publishMessage,
  type ApplicationContent,
  type CampaignContent,
} from '../src/shared/messages'
import { db, queries, type CampaignRow } from './db'
import { creatorStatus, creatorStatuses, operatorAccount, operatorBalance, readCampaign } from './chain'
import { HOLD_SECONDS, settleState, startSettlementLoop } from './settle'

const PORT = Number(process.env.TRACKER_PORT ?? process.env.PORT ?? 3001)
/** In production one process serves the built website and the API (under /api). */
const SERVE_STATIC = process.env.NODE_ENV === 'production'
const DIST = join(import.meta.dir, '..', 'dist')
const DEDUPE_MINUTES = Number(process.env.CLICK_DEDUPE_MINUTES ?? 60)
const IP_DAILY_CAP = 60
const LINK_HOURLY_CAP = 300
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|facebookexternalhit|curl|wget|python-requests|httpclient/i
const IP_SALT = createHash('sha256').update(`${process.env.OPERATOR_PRIVATE_KEY ?? 'clickpot'}:ip`).digest('hex')

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function text(value: unknown, field: string, max: number, min = 0): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} is required`)
  const v = value.trim()
  if (v.length < min) throw new HttpError(400, `${field} is too short`)
  if (v.length > max) throw new HttpError(400, `${field} is too long`)
  return v
}

function url(value: unknown, field: string, optional = false): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v && optional) return ''
  try {
    const parsed = new URL(v)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
    if (v.length > 300) throw new HttpError(400, `${field} is too long`)
    return parsed.toString()
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, `${field} must be a valid http(s) link`)
  }
}

function addr(value: unknown, field = 'address'): Address {
  if (typeof value !== 'string' || !isAddress(value)) throw new HttpError(400, `${field} is not a valid address`)
  return value.toLowerCase() as Address
}

async function requireSigner(message: string, signature: unknown, expected: string) {
  if (typeof signature !== 'string' || !signature.startsWith('0x')) throw new HttpError(401, 'Signature required')
  const signer = await recoverMessageAddress({ message, signature: signature as Hex }).catch(() => null)
  if (!signer || signer.toLowerCase() !== expected.toLowerCase()) throw new HttpError(401, 'Signature does not match')
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = (await req.json()) as unknown
    if (data && typeof data === 'object') return data as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Invalid JSON body')
}

const num = (value: string, field = 'id') => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${field} is invalid`)
  return n
}

function publicCampaign(c: CampaignRow) {
  return {
    id: c.id,
    owner: c.owner,
    title: c.title,
    tagline: c.tagline,
    description: c.description,
    category: c.category,
    destinationUrl: c.destination_url,
    destinationHost: new URL(c.destination_url).hostname.replace(/^www\./, ''),
    imageUrl: c.image_url,
    requirements: c.requirements,
    createdAt: c.created_at,
    clicks: queries.campaignClicks(c.id),
    partners: queries.campaignPartners(c.id),
    applicants: queries.applicationsFor(c.id).filter((a) => !a.dismissed).length,
  }
}

const hourly = (code: string, since: number) =>
  (db.query('SELECT COUNT(*) n FROM clicks WHERE code = ? AND ts >= ?').get(code, since) as { n: number }).n

/** Why a campaign/link would not currently pay for a click, or null when it would. */
async function inactiveReason(campaignId: number, creator: Address): Promise<string | null> {
  const chain = await readCampaign(campaignId)
  if (!chain) return 'campaign_missing'
  if (chain.paused) return 'paused'
  if (chain.closing) return 'closed'
  if (BigInt(Math.floor(Date.now() / 1000)) >= chain.endsAt) return 'ended'
  if ((await creatorStatus(campaignId, creator)) !== 1) return 'creator_inactive'
  const inFlight = BigInt(queries.campaignInFlight(campaignId))
  if (chain.balance - inFlight * chain.ratePerClick < chain.ratePerClick) return 'exhausted'
  return null
}

async function route(req: Request, server: { requestIP(req: Request): { address: string } | null }): Promise<Response> {
  const { pathname, searchParams } = new URL(req.url)
  const parts = pathname.split('/').filter(Boolean)
  const method = req.method

  if (method === 'GET' && pathname === '/health') {
    const bal = await operatorBalance().catch(() => 0n)
    return json({
      ok: true,
      operator: operatorAccount?.address ?? null,
      operatorFunded: bal > 10n ** 16n,
      dedupeMinutes: DEDUPE_MINUTES,
      holdSeconds: HOLD_SECONDS,
      lastError: settleState.lastError,
      lastSettledAt: settleState.lastSettledAt,
    })
  }

  if (method === 'GET' && pathname === '/stats') return json(queries.globalTotals())

  if (method === 'GET' && pathname === '/feed') {
    return json(
      queries.recentPayouts(12).map((p) => ({
        id: p.id,
        campaignId: p.campaign_id,
        title: p.title,
        creator: p.creator,
        clicks: p.clicks,
        amount: p.amount,
        txHash: p.tx_hash,
        ts: p.ts,
      })),
    )
  }

  if (parts[0] === 'campaigns') {
    if (method === 'GET' && parts.length === 1) {
      const owner = searchParams.get('owner')
      return json(queries.campaigns(owner ? addr(owner, 'owner') : undefined).map(publicCampaign))
    }

    if (method === 'POST' && parts.length === 1) {
      const b = await body(req)
      const id = num(String(b.id))
      if (queries.campaign(id)) throw new HttpError(409, 'Campaign already published')
      const onchain = await readCampaign(id, true)
      if (!onchain) throw new HttpError(404, 'Campaign not found onchain')
      const category = text(b.category, 'category', 40, 1)
      if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, 'Unknown category')
      const content: CampaignContent = {
        title: text(b.title, 'title', 80, 3),
        tagline: text(b.tagline, 'tagline', 120, 3),
        description: text(b.description, 'description', 1000, 10),
        category,
        destinationUrl: url(b.destinationUrl, 'destinationUrl'),
        imageUrl: url(b.imageUrl, 'imageUrl', true),
        requirements: text(b.requirements ?? '', 'requirements', 500),
      }
      await requireSigner(publishMessage(id, contentHash(content)), b.signature, onchain.owner)
      db.query(
        `INSERT INTO campaigns (id, owner, title, tagline, description, category, destination_url, image_url, requirements, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        onchain.owner.toLowerCase(),
        content.title,
        content.tagline,
        content.description,
        content.category,
        content.destinationUrl,
        content.imageUrl,
        content.requirements,
        Date.now(),
      )
      return json(publicCampaign(queries.campaign(id)!), 201)
    }

    const id = num(parts[1] ?? '')
    const campaign = queries.campaign(id)

    if (method === 'GET' && parts.length === 2) {
      if (!campaign) throw new HttpError(404, 'Campaign not found')
      return json({
        ...publicCampaign(campaign),
        views: queries.campaignViews(id),
        paid: queries.campaignPaid(id),
        inFlight: queries.campaignInFlight(id),
        daily: queries.dailyClicks(id, null, 14),
      })
    }

    if (method === 'GET' && parts[2] === 'applications') {
      if (!campaign) throw new HttpError(404, 'Campaign not found')
      const apps = queries.applicationsFor(id).filter((a) => !a.dismissed)
      const statuses = await creatorStatuses(id, apps.map((a) => a.creator as Address))
      const partners = new Map(queries.creatorsOfCampaign(id).map((c) => [c.creator, c]))
      return json(
        apps.map((a, i) => ({
          creator: a.creator,
          handle: a.handle,
          platform: a.platform,
          profileUrl: a.profile_url,
          audience: a.audience,
          note: a.note,
          createdAt: a.created_at,
          status: statuses[i] === 1 ? 'approved' : statuses[i] === 2 ? 'revoked' : 'pending',
          code: partners.get(a.creator)?.code ?? null,
          clicks: partners.get(a.creator)?.clicks ?? 0,
          paid: partners.get(a.creator)?.paid ?? 0,
        })),
      )
    }

    if (method === 'POST' && parts[2] === 'apply') {
      if (!campaign) throw new HttpError(404, 'Campaign not found')
      const b = await body(req)
      const creator = addr(b.creator, 'creator')
      const platform = text(b.platform, 'platform', 20, 1)
      if (!(PLATFORMS as readonly string[]).includes(platform)) throw new HttpError(400, 'Unknown platform')
      const content: ApplicationContent = {
        handle: text(b.handle, 'handle', 40, 2),
        platform,
        profileUrl: url(b.profileUrl, 'profileUrl'),
        audience: text(b.audience ?? '', 'audience', 40),
        note: text(b.note ?? '', 'note', 400),
      }
      await requireSigner(applyMessage(id, creator, contentHash(content)), b.signature, creator)
      const chain = await readCampaign(id, true)
      if (!chain || chain.closing || BigInt(Math.floor(Date.now() / 1000)) >= chain.endsAt) {
        throw new HttpError(409, 'This campaign is no longer accepting creators')
      }
      if (chain.owner.toLowerCase() === creator) throw new HttpError(400, 'You cannot promote your own campaign')
      if ((await creatorStatus(id, creator)) === 1) throw new HttpError(409, 'You are already approved')
      db.query(
        `INSERT INTO applications (campaign_id, creator, handle, platform, profile_url, audience, note, dismissed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT (campaign_id, creator) DO UPDATE SET handle = excluded.handle, platform = excluded.platform,
           profile_url = excluded.profile_url, audience = excluded.audience, note = excluded.note, dismissed = 0`,
      ).run(id, creator, content.handle, content.platform, content.profileUrl, content.audience, content.note, Date.now())
      return json({ ok: true }, 201)
    }

    if (method === 'POST' && parts[2] === 'dismiss') {
      if (!campaign) throw new HttpError(404, 'Campaign not found')
      const b = await body(req)
      const creator = addr(b.creator, 'creator')
      await requireSigner(dismissMessage(id, creator), b.signature, campaign.owner)
      db.query('UPDATE applications SET dismissed = 1 WHERE campaign_id = ? AND creator = ?').run(id, creator)
      return json({ ok: true })
    }

    if (method === 'GET' && parts[2] === 'me') {
      const creator = addr(searchParams.get('creator'), 'creator')
      const application = queries.application(id, creator)
      const link = queries.linkFor(id, creator)
      const status = await creatorStatus(id, creator).catch(() => 0)
      return json({
        applied: !!application && !application.dismissed,
        dismissed: !!application?.dismissed,
        status: status === 1 ? 'approved' : status === 2 ? 'revoked' : 'none',
        code: link?.code ?? null,
        handle: application?.handle ?? null,
      })
    }
  }

  if (parts[0] === 'creators' && parts[1] && method === 'GET') {
    const creator = addr(parts[1], 'creator')
    const apps = queries.applicationsOf(creator).filter((a) => !a.dismissed)
    const links = new Map(queries.linksOf(creator).map((l) => [l.campaign_id, l]))
    const inFlight = new Map(queries.creatorInFlight(creator).map((r) => [r.campaign_id, r.n]))
    const totals = queries.creatorTotals(creator)
    const rows = await Promise.all(
      apps.map(async (a) => {
        const campaign = queries.campaign(a.campaign_id)
        const chain = await readCampaign(a.campaign_id)
        const status = await creatorStatus(a.campaign_id, creator).catch(() => 0)
        const link = links.get(a.campaign_id)
        const stats = link ? queries.linkStats(link.code) : null
        return {
          campaignId: a.campaign_id,
          title: campaign?.title ?? `Campaign #${a.campaign_id}`,
          tagline: campaign?.tagline ?? '',
          destinationHost: campaign ? new URL(campaign.destination_url).hostname.replace(/^www\./, '') : '',
          ratePerClick: chain ? chain.ratePerClick.toString() : '0',
          status: status === 1 ? 'approved' : status === 2 ? 'revoked' : 'pending',
          appliedAt: a.created_at,
          code: link?.code ?? null,
          clicks: stats?.clicks ?? 0,
          views: stats?.views ?? 0,
          earned: stats?.earned ?? 0,
          pendingClicks: inFlight.get(a.campaign_id) ?? 0,
          live: chain ? !chain.paused && !chain.closing && BigInt(Math.floor(Date.now() / 1000)) < chain.endsAt : false,
        }
      }),
    )
    return json({
      earned: totals.earned,
      clicks: totals.clicks,
      pendingClicks: [...inFlight.values()].reduce((a, b) => a + b, 0),
      daily: queries.dailyClicks(null, creator, 14),
      partnerships: rows,
      payouts: queries.payoutsOf(creator).map((p) => ({
        id: p.id,
        campaignId: p.campaign_id,
        title: queries.campaign(p.campaign_id)?.title ?? `Campaign #${p.campaign_id}`,
        clicks: p.clicks,
        amount: p.amount,
        txHash: p.tx_hash,
        ts: p.ts,
      })),
    })
  }

  if (parts[0] === 'links' && parts[1]) {
    const link = queries.link(parts[1])
    if (!link) throw new HttpError(404, 'This link does not exist')
    const campaign = queries.campaign(link.campaign_id)
    if (!campaign) throw new HttpError(404, 'This link does not exist')

    if (method === 'GET' && parts.length === 2) {
      db.query('INSERT INTO views (code, ts) VALUES (?, ?)').run(link.code, Date.now())
      const chain = await readCampaign(campaign.id)
      const app = queries.application(campaign.id, link.creator)
      return json({
        code: link.code,
        campaignId: campaign.id,
        creator: link.creator,
        creatorHandle: app?.handle ?? null,
        title: campaign.title,
        tagline: campaign.tagline,
        description: campaign.description,
        category: campaign.category,
        imageUrl: campaign.image_url,
        owner: campaign.owner,
        destinationHost: new URL(campaign.destination_url).hostname.replace(/^www\./, ''),
        destinationUrl: campaign.destination_url,
        ratePerClick: chain ? chain.ratePerClick.toString() : '0',
      })
    }

    if (method === 'POST' && parts[2] === 'click') {
      const b = await body(req)
      const respond = (counted: boolean, reason?: string) =>
        json({ destination: campaign.destination_url, counted, reason: reason ?? null })

      if (BOT_UA.test(req.headers.get('user-agent') ?? '')) return respond(false, 'bot')
      const visitor = typeof b.visitor === 'string' ? b.visitor : ''
      if (visitor.length < 16 || visitor.length > 64) return respond(false, 'invalid_visitor')
      const wallet = typeof b.wallet === 'string' && isAddress(b.wallet) ? b.wallet.toLowerCase() : null
      if (wallet && (wallet === link.creator || wallet === campaign.owner)) return respond(false, 'self_click')

      const reason = await inactiveReason(campaign.id, link.creator as Address)
      if (reason) return respond(false, reason)

      const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const ip = forwarded || server.requestIP(req)?.address || 'unknown'
      const ipHash = createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 24)
      const now = Date.now()

      const dup = db
        .query('SELECT 1 FROM clicks WHERE code = ? AND visitor = ? AND ts >= ?')
        .get(link.code, visitor, now - DEDUPE_MINUTES * 60_000)
      if (dup) return respond(false, 'duplicate')
      const ipCount = (
        db.query('SELECT COUNT(*) n FROM clicks WHERE code = ? AND ip_hash = ? AND ts >= ?').get(link.code, ipHash, now - 86_400_000) as {
          n: number
        }
      ).n
      if (ipCount >= IP_DAILY_CAP || hourly(link.code, now - 3_600_000) >= LINK_HOURLY_CAP) return respond(false, 'rate_limited')

      db.query('INSERT INTO clicks (code, campaign_id, creator, visitor, ip_hash, ts, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        link.code,
        campaign.id,
        link.creator,
        visitor,
        ipHash,
        now,
        'pending',
      )
      return respond(true)
    }
  }

  throw new HttpError(404, 'Not found')
}

async function serveStatic(pathname: string): Promise<Response> {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const target = join(DIST, safe)
  if (target.startsWith(DIST) && !safe.endsWith('/')) {
    const file = Bun.file(target)
    if (await file.exists()) {
      const immutable = safe.startsWith('/assets/') || safe.startsWith('assets/')
      return new Response(file, { headers: { 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } })
    }
  }
  // Unknown paths without a file extension are app routes: hand them to the single-page app.
  if (!/\.[a-z0-9]+$/i.test(safe)) return new Response(Bun.file(join(DIST, 'index.html')), { headers: { 'cache-control': 'no-cache' } })
  return new Response('Not found', { status: 404 })
}

try {
  Bun.serve({
    port: PORT,
    async fetch(req, server) {
      try {
        const url = new URL(req.url)
        if (SERVE_STATIC && !url.pathname.startsWith('/api/')) return await serveStatic(url.pathname)
        if (url.pathname.startsWith('/api/')) {
          const stripped = new URL(url.pathname.slice(4) + url.search, url.origin)
          return await route(new Request(stripped.toString(), req), server)
        }
        return await route(req, server)
      } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status)
        console.error('[server]', error)
        return json({ error: 'Something went wrong' }, 500)
      }
    },
  })
  console.log(`Clickpot tracker listening on :${PORT}`)
  startSettlementLoop()
  if (!operatorAccount) console.warn('OPERATOR_PRIVATE_KEY missing: clicks will be recorded but not paid out')
} catch (error) {
  console.error('Tracker failed to start (is it already running?):', error instanceof Error ? error.message : error)
  process.exit(1)
}
