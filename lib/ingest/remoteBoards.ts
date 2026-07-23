import type { NormalizedJob } from "./normalize"

export type RemoteBoardKind = "remoteok" | "remotive" | "himalayas" | "weworkremotely"

export interface RemoteBoardSource {
  kind: RemoteBoardKind
  id: string
  name: string
  enabled: boolean
  rateLimitMs: number
  trustScore: number
  fetch: () => Promise<NormalizedJob[]>
}

export const REMOTE_BOARD_SOURCES: RemoteBoardSource[] = [
  {
    kind: "remoteok",
    id: "remoteok:api",
    name: "RemoteOK",
    enabled: true,
    rateLimitMs: 1000,
    trustScore: 85,
    fetch: async () => {
      const { fetchRemoteOK } = await import("./sources/remoteok")
      return fetchRemoteOK()
    },
  },
  {
    kind: "remotive",
    id: "remotive:api",
    name: "Remotive",
    enabled: true,
    rateLimitMs: 1000,
    trustScore: 80,
    fetch: async () => {
      const { fetchRemotive } = await import("./sources/remotive")
      return fetchRemotive()
    },
  },
  {
    kind: "himalayas",
    id: "himalayas:api",
    name: "Himalayas",
    enabled: true,
    rateLimitMs: 1500,
    trustScore: 85,
    fetch: async () => {
      const { fetchHimalayas } = await import("./sources/himalayas")
      return fetchHimalayas(100)
    },
  },
  {
    kind: "weworkremotely",
    id: "weworkremotely:rss",
    name: "We Work Remotely",
    enabled: true,
    rateLimitMs: 2000,
    trustScore: 85,
    fetch: async () => {
      const { fetchWeWorkRemotelyAll } = await import("./sources/weworkremotely")
      return fetchWeWorkRemotelyAll()
    },
  },
]

export function getEnabledRemoteBoards() {
  return REMOTE_BOARD_SOURCES.filter(s => s.enabled)
}
