/**
 * Smart Router API — Audit, test, and observe routing decisions
 * 
 * GET /api/ai/registry?action=test      → Prove different tasks route to different models
 * GET /api/ai/registry?action=stats     → Provider health scores and rankings
 * GET /api/ai/registry?action=logs      → Recent routing decisions with reasoning
 * GET /api/ai/registry?action=health    → DB-persisted provider health
 */

import { NextRequest, NextResponse } from "next/server"
import { testRoutingAllTasks, getRoutingStats, getRoutingLogs } from "@/lib/ai/smart-router"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action") || "stats"

    switch (action) {
      case "test": {
        // Prove different tasks route to different models
        const routing = testRoutingAllTasks()
        const uniqueProviders = new Set(Object.values(routing).map((r: any) => r.selected))
        return NextResponse.json({
          success: true,
          routingDecisions: routing,
          summary: {
            totalTasks: Object.keys(routing).length,
            uniqueProvidersSelected: uniqueProviders.size,
            providers: Array.from(uniqueProviders),
            routingVaries: uniqueProviders.size > 1,
          },
        })
      }

      case "stats": {
        const stats = getRoutingStats()
        return NextResponse.json({ success: true, ...stats })
      }

      case "logs": {
        const count = parseInt(req.nextUrl.searchParams.get("count") || "50")
        const logs = getRoutingLogs(Math.min(count, 200))
        return NextResponse.json({ success: true, count: logs.length, logs })
      }

      case "health": {
        const { getOrchHealth } = await import("@/lib/ai/orchestrator")
        const health = getOrchHealth()
        return NextResponse.json({ success: true, health })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message?.slice(0, 500) || "Unknown error",
    }, { status: 500 })
  }
}
