import { randomBytes } from 'node:crypto'
import type { Address, Hex } from 'viem'
import { clickPotAbi } from '../src/abi/clickPot'
import { db, queries } from './db'
import { CLICKPOT, creatorStatuses, publicClient, readCampaign, walletClient } from './chain'

const MAX_BATCH = 50
const SETTLE_EVERY_MS = 10_000
const BACKOFF_MS = 30_000
/** Clicks wait this long before payout so obvious fraud can be filtered first. */
export const HOLD_SECONDS = Number(process.env.CLICK_HOLD_SECONDS ?? 30)

let running = false
let backoffUntil = 0
export const settleState = { lastError: '' as string, lastSettledAt: 0, lastTx: '' as string }

interface Entry {
  creator: Address
  n: number
}

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), '[settle]', ...args)
}

/** Mints a tracked link for every applicant the business has approved onchain. */
export async function mintLinks() {
  const pending = queries.unlinkedApplications()
  const byCampaign = new Map<number, string[]>()
  for (const app of pending) {
    byCampaign.set(app.campaign_id, [...(byCampaign.get(app.campaign_id) ?? []), app.creator])
  }
  for (const [campaignId, creators] of byCampaign) {
    const statuses = await creatorStatuses(campaignId, creators as Address[])
    creators.forEach((creator, i) => {
      if (statuses[i] !== 1) return
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode()
        try {
          db.query('INSERT INTO links (code, campaign_id, creator, created_at) VALUES (?, ?, ?, ?)').run(
            code,
            campaignId,
            creator,
            Date.now(),
          )
          log(`link ${code} minted for campaign #${campaignId}`)
          break
        } catch {
          // code collision or already minted: try again / move on
        }
      }
    })
  }
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function newCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

function releaseBatch(batchId: string) {
  db.query("UPDATE clicks SET status = 'pending', batch_id = NULL WHERE batch_id = ? AND status = 'batched'").run(batchId)
  db.query("UPDATE batches SET status = 'failed' WHERE id = ?").run(batchId)
}

function confirmBatch(batchId: string, campaignId: number, txHash: string, entries: Entry[], rate: bigint) {
  const ts = Date.now()
  db.transaction(() => {
    db.query("UPDATE clicks SET status = 'settled' WHERE batch_id = ?").run(batchId)
    db.query("UPDATE batches SET status = 'confirmed', tx_hash = ? WHERE id = ?").run(txHash, batchId)
    for (const e of entries) {
      db.query(
        'INSERT INTO settlements (batch_id, campaign_id, creator, clicks, amount, tx_hash, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(batchId, campaignId, e.creator, e.n, Number(BigInt(e.n) * rate), txHash, ts)
    }
  })()
}

/** Settles any batch left half-finished by a restart, using chain state as the source of truth. */
export async function recoverBatches() {
  const open = db.query("SELECT * FROM batches WHERE status = 'sent'").all() as {
    id: string
    campaign_id: number
    tx_hash: string | null
  }[]
  for (const batch of open) {
    const used = await publicClient.readContract({
      address: CLICKPOT,
      abi: clickPotAbi,
      functionName: 'usedBatch',
      args: [batch.id as Hex],
    })
    if (!used) {
      releaseBatch(batch.id)
      continue
    }
    const campaign = await readCampaign(batch.campaign_id, true)
    const rows = db
      .query("SELECT creator, COUNT(*) n FROM clicks WHERE batch_id = ? GROUP BY creator")
      .all(batch.id) as Entry[]
    if (campaign) confirmBatch(batch.id, batch.campaign_id, batch.tx_hash ?? '0x', rows, campaign.ratePerClick)
    log(`recovered batch ${batch.id.slice(0, 10)}`)
  }
}

async function settleCampaign(campaignId: number, rows: Entry[]) {
  if (!walletClient) return
  const campaign = await readCampaign(campaignId, true)
  if (!campaign) return
  const rate = campaign.ratePerClick
  let remaining = campaign.balance
  const chosen: Entry[] = []

  for (const row of rows) {
    if (chosen.length >= MAX_BATCH) break
    const affordable = rate > 0n ? Number(remaining / rate) : 0
    const take = Math.min(row.n, affordable)
    if (take < row.n) {
      // The pot cannot cover these clicks: they are no longer payable.
      db.query(
        `UPDATE clicks SET status = 'dropped' WHERE id IN (
           SELECT id FROM clicks WHERE campaign_id = ? AND creator = ? AND status = 'pending' ORDER BY id DESC LIMIT ?)`,
      ).run(campaignId, row.creator, row.n - take)
    }
    if (take > 0) {
      chosen.push({ creator: row.creator, n: take })
      remaining -= BigInt(take) * rate
    }
  }
  if (chosen.length === 0) return

  const batchId = `0x${randomBytes(32).toString('hex')}` as Hex
  db.transaction(() => {
    db.query("INSERT INTO batches (id, campaign_id, status, created_at) VALUES (?, ?, 'sent', ?)").run(
      batchId,
      campaignId,
      Date.now(),
    )
    for (const e of chosen) {
      db.query(
        `UPDATE clicks SET status = 'batched', batch_id = ? WHERE id IN (
           SELECT id FROM clicks WHERE campaign_id = ? AND creator = ? AND status = 'pending' ORDER BY id LIMIT ?)`,
      ).run(batchId, campaignId, e.creator, e.n)
    }
  })()

  try {
    const hash = await walletClient.writeContract({
      address: CLICKPOT,
      abi: clickPotAbi,
      functionName: 'settle',
      args: [BigInt(campaignId), batchId, chosen.map((e) => e.creator), chosen.map((e) => e.n)],
    })
    db.query('UPDATE batches SET tx_hash = ? WHERE id = ?').run(hash, batchId)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`settle reverted (${hash})`)
    confirmBatch(batchId, campaignId, hash, chosen, rate)
    settleState.lastError = ''
    settleState.lastSettledAt = Date.now()
    settleState.lastTx = hash
    const total = chosen.reduce((sum, e) => sum + e.n, 0)
    log(`campaign #${campaignId}: paid ${total} clicks to ${chosen.length} creators (${hash.slice(0, 10)})`)
  } catch (error) {
    releaseBatch(batchId)
    settleState.lastError = error instanceof Error ? error.message.split('\n')[0] : String(error)
    backoffUntil = Date.now() + BACKOFF_MS
    log(`campaign #${campaignId} settlement failed, will retry:`, settleState.lastError)
  }
}

export async function settleOnce() {
  if (running || Date.now() < backoffUntil) return
  running = true
  try {
    await mintLinks()
    const rows = db
      .query("SELECT campaign_id, creator, COUNT(*) n FROM clicks WHERE status = 'pending' AND ts <= ? GROUP BY campaign_id, creator ORDER BY campaign_id, MIN(id)")
      .all(Date.now() - HOLD_SECONDS * 1000) as { campaign_id: number; creator: Address; n: number }[]
    const byCampaign = new Map<number, Entry[]>()
    for (const row of rows) {
      byCampaign.set(row.campaign_id, [...(byCampaign.get(row.campaign_id) ?? []), { creator: row.creator, n: row.n }])
    }
    for (const [campaignId, entries] of byCampaign) {
      await settleCampaign(campaignId, entries)
      if (Date.now() < backoffUntil) break
    }
  } catch (error) {
    settleState.lastError = error instanceof Error ? error.message.split('\n')[0] : String(error)
    log('cycle error:', settleState.lastError)
  } finally {
    running = false
  }
}

export function startSettlementLoop() {
  void recoverBatches()
    .catch((error) => log('recovery error:', error instanceof Error ? error.message : error))
    .finally(() => {
      setInterval(() => void settleOnce(), SETTLE_EVERY_MS)
      void settleOnce()
    })
}
