import { BaseError, ContractFunctionRevertedError } from 'viem'

const CONTRACT_MESSAGES: Record<string, string> = {
  InvalidRate: 'The rate per click must be greater than zero.',
  InvalidDeposit: 'The deposit has to cover at least one click.',
  InvalidDuration: 'Choose a duration between 1 and 180 days.',
  NotCampaignOwner: 'Only the business that created this campaign can do that.',
  CampaignClosing: 'This campaign is closing, so it no longer accepts changes.',
  CampaignEnded: 'This campaign has ended.',
  WithdrawalLocked: 'The pot is still locked to protect creators. Try again after it unlocks.',
  NothingToWithdraw: 'There is nothing left in the pot.',
  InvalidCreatorStatus: 'That creator is already in this state.',
  NothingToClaim: 'You have no payouts waiting to be claimed.',
  CampaignNotFound: 'That campaign does not exist.',
  InsufficientBudget: "This campaign's budget is used up.",
  BatchAlreadyUsed: 'That payout batch was already processed.',
}

export class UserCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

/** Turns wallet, viem and contract errors into one friendly sentence. */
export function friendlyError(error: unknown): string {
  if (error instanceof UserCancelled) return 'Cancelled.'
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      if (reverted.data.errorName === 'WithdrawalLocked') {
        const unlock = reverted.data.args?.[0]
        if (typeof unlock === 'bigint') return `Funds unlock on ${new Date(Number(unlock) * 1000).toLocaleString()}.`
      }
      return CONTRACT_MESSAGES[reverted.data.errorName] ?? `The contract rejected this action (${reverted.data.errorName}).`
    }
    const msg = error.shortMessage.toLowerCase()
    if (msg.includes('user rejected') || msg.includes('denied')) return 'Cancelled in your wallet.'
    if (msg.includes('insufficient funds')) return 'Not enough USDC to cover gas. Use "Get test USDC" in the sidebar.'
    return error.shortMessage
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('user rejected') || msg.includes('denied')) return 'Cancelled in your wallet.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export const isCancelled = (error: unknown) =>
  error instanceof UserCancelled ||
  (error instanceof Error && /user rejected|user denied|rejected the request/i.test(error.message))
