import { useEffect, useState } from 'react'
import { buildShareLink } from '@/lib/share'

/** Resolves a share-safe link for a path once, so copy buttons can run synchronously. */
export function useShareLink(path: string | null): string | null {
  const [result, setResult] = useState<{ path: string; link: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    void buildShareLink(path).then((link) => {
      if (live) setResult({ path, link })
    })
    return () => {
      live = false
    }
  }, [path])
  return result && result.path === path ? result.link : null
}
