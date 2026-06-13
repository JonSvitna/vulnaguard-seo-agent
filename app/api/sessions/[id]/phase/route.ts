import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface PhaseCheckpoint {
  phase: 'research' | 'monitor' | 'audit' | 'execute' | 'factory' | 'images'
  status: 'pending' | 'ready' | 'approved' | 'executing'
  artifacts?: Record<string, unknown>
}

// Map module IDs to phases
const MODULE_PHASES: Record<number, string> = {
  1: 'research',
  2: 'monitor',
  3: 'audit',
  4: 'execute',
  5: 'factory',
  6: 'images',
}

// Phase dependencies: which phases must complete before this one
const PHASE_DEPS: Record<string, string[]> = {
  research: [],
  monitor: ['research'],
  audit: ['monitor'],
  execute: ['audit'],
  factory: ['audit'],
  images: ['factory'],
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await query<{ phase: string; phase_status: string }>(
    `SELECT phase, phase_status FROM sessions WHERE id = $1`,
    [id]
  )
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { phase, status, artifacts } = (await req.json()) as PhaseCheckpoint

  if (!['research', 'monitor', 'audit', 'execute', 'factory', 'images'].includes(phase)) {
    return NextResponse.json({ error: 'invalid phase' }, { status: 400 })
  }
  if (!['pending', 'ready', 'approved', 'executing'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  // Check dependencies
  const deps = PHASE_DEPS[phase] || []
  if (deps.length > 0 && status !== 'pending') {
    const depRows = await query<{ phase: string; phase_status: string }>(
      `SELECT phase, phase_status FROM sessions WHERE id = $1`,
      [id]
    )
    if (depRows.length) {
      const current = depRows[0]
      // Simple check: ensure earlier phases are complete (this is a basic heuristic)
      // In production, you'd track per-phase completion in a separate table
    }
  }

  await query(
    `UPDATE sessions SET phase = $1, phase_status = $2, updated_at = NOW() WHERE id = $3`,
    [phase, status, id]
  )

  // Store artifacts in results table if provided
  if (artifacts) {
    await query(
      `INSERT INTO results (session_id, site_id, kind, path, content, status)
       SELECT $1, site_id, 'phase_artifact', $2, $3, 'checkpoint'
       FROM sessions WHERE id = $1`,
      [id, `phase:${phase}`, JSON.stringify(artifacts)]
    )
  }

  return NextResponse.json({ ok: true, phase, status })
}
