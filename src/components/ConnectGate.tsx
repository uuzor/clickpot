import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui'

/** Renders children once a wallet is connected, otherwise a connect button. */
export function ConnectGate({ children, label = 'Connect wallet', block = true }: { children?: ReactNode; label?: string; block?: boolean }) {
  const { isConnected } = useAccount()
  if (isConnected) return <>{children}</>
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <Button block={block} size="lg" onClick={show} loading={isConnecting}>
          {!isConnecting && <Wallet className="size-4" />}
          {label}
        </Button>
      )}
    </ConnectKitButton.Custom>
  )
}
