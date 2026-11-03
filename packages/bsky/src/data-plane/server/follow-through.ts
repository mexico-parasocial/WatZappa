/*
 * Seguimiento: what happened after a cabildeo resolved. Pure rules, no I/O, so
 * they can be tested without a database. The reader in
 * routes/follow-through.ts decides who may write; this decides what a set of
 * compromisos and updates amounts to. See PARA/docs/seguimiento-spec.md.
 */

export const FOLLOW_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'blocked',
  'abandoned',
] as const

export type FollowStatus = (typeof FOLLOW_STATUSES)[number]

export const isFollowStatus = (value: unknown): value is FollowStatus =>
  typeof value === 'string' &&
  (FOLLOW_STATUSES as readonly string[]).includes(value)

export type FollowItem = {
  uri: string
  cid: string
  author: string
  cabildeo: string
  communityUri: string
  optionIndex: number
  parent: string | null
  title: string
  summary: string | null
  responsibleDid: string | null
  responsibleLabel: string | null
  dueAt: string | null
  edited: boolean
  createdAt: string
}

export type FollowUpdate = {
  uri: string
  author: string
  subject: string
  status: FollowStatus
  progress: number | null
  note: string | null
  evidenceUris: string[]
  dueAt: string | null
  edited: boolean
  occurredAt: string
  createdAt: string
}

export type FollowUpdateView = Omit<
  FollowUpdate,
  'subject' | 'progress' | 'note' | 'dueAt'
> & {
  progress?: number
  note?: string
  dueAt?: string
}

export type FollowThroughView = {
  uri: string
  cid: string
  author: string
  cabildeo: string
  communityUri: string
  optionIndex: number
  parent?: string
  title: string
  summary?: string
  responsibleDid?: string
  responsibleLabel?: string
  dueAt?: string
  currentDueAt?: string
  rescheduledCount: number
  status: FollowStatus
  progress?: number
  overdue: boolean
  lastUpdateAt?: string
  edited: boolean
  withdrawnUpdates?: number
  children?: FollowThroughView[]
  updates?: FollowUpdateView[]
  createdAt: string
}

export type FollowSummary = {
  cabildeo: string
  total: number
  completed: number
  overdue: number
  abandoned: number
  progress?: number
  nextDueAt?: string
  lastUpdateAt?: string
}

/** The columns of `cabildeo_cabildeo` that decide whether it can be followed. */
export type FollowableCabildeo = {
  kind: string | null
  phase: string
  winningOption: number | null
  isTie: 0 | 1
  voteCount: number
  minQuorum: number | null
}

/**
 * Whether a cabildeo has a result that can be followed (R2). Records without a
 * kind are `activity`. Only the public view tier is served until tiered
 * visibility exists, so a missing tier means public.
 *
 * @NOTE `minQuorum` is checked here because resolution does not enforce it yet.
 */
export function isFollowable(
  cabildeo: FollowableCabildeo,
  minimumViewTier: string | null | undefined,
): boolean {
  if ((cabildeo.kind ?? 'activity') !== 'activity') return false
  if (cabildeo.phase !== 'resolved') return false
  if (cabildeo.isTie === 1) return false
  if (typeof cabildeo.winningOption !== 'number') return false
  if (
    typeof cabildeo.minQuorum === 'number' &&
    cabildeo.voteCount < cabildeo.minQuorum
  ) {
    return false
  }
  return !minimumViewTier || minimumViewTier === 'public'
}

const compareUpdates = (a: FollowUpdate, b: FollowUpdate) =>
  a.occurredAt.localeCompare(b.occurredAt) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.uri.localeCompare(b.uri)

type OwnState = {
  status: FollowStatus
  progress: number | undefined
  currentDueAt: string | null
  rescheduledCount: number
  lastUpdateAt: string | undefined
}

/** The state an item's own updates amount to, before any rollup from children. */
export function deriveOwnState(
  item: Pick<FollowItem, 'dueAt'>,
  updates: readonly FollowUpdate[],
): OwnState {
  const ordered = [...updates].sort(compareUpdates)
  let status: FollowStatus = 'planned'
  let declared: number | undefined
  let currentDueAt = item.dueAt
  let rescheduledCount = 0
  for (const update of ordered) {
    status = update.status
    if (update.progress !== null) declared = update.progress
    if (update.dueAt !== null) {
      if (currentDueAt !== null && update.dueAt !== currentDueAt) {
        rescheduledCount++
      }
      currentDueAt = update.dueAt
    }
  }
  let progress: number | undefined
  if (status === 'completed') progress = 100
  else if (status === 'abandoned') progress = undefined
  else if (declared !== undefined) progress = declared
  else if (status === 'planned') progress = 0
  return {
    status,
    progress,
    currentDueAt,
    rescheduledCount,
    lastUpdateAt: ordered.at(-1)?.occurredAt,
  }
}

const isOverdue = (
  status: FollowStatus,
  currentDueAt: string | null,
  now: Date,
) =>
  currentDueAt !== null &&
  status !== 'completed' &&
  status !== 'abandoned' &&
  Date.parse(currentDueAt) < now.getTime()

const toUpdateView = (update: FollowUpdate): FollowUpdateView => ({
  uri: update.uri,
  author: update.author,
  status: update.status,
  ...(update.progress !== null && { progress: update.progress }),
  ...(update.note !== null && { note: update.note }),
  evidenceUris: update.evidenceUris,
  ...(update.dueAt !== null && { dueAt: update.dueAt }),
  edited: update.edited,
  occurredAt: update.occurredAt,
  createdAt: update.createdAt,
})

const toView = (
  item: FollowItem,
  own: OwnState,
  now: Date,
  overrides: Partial<Pick<OwnState, 'status' | 'progress'>> = {},
): FollowThroughView => {
  const status = overrides.status ?? own.status
  const progress = 'progress' in overrides ? overrides.progress : own.progress
  return {
    uri: item.uri,
    cid: item.cid,
    author: item.author,
    cabildeo: item.cabildeo,
    communityUri: item.communityUri,
    optionIndex: item.optionIndex,
    ...(item.parent !== null && { parent: item.parent }),
    title: item.title,
    ...(item.summary !== null && { summary: item.summary }),
    ...(item.responsibleDid !== null && {
      responsibleDid: item.responsibleDid,
    }),
    ...(item.responsibleLabel !== null && {
      responsibleLabel: item.responsibleLabel,
    }),
    ...(item.dueAt !== null && { dueAt: item.dueAt }),
    ...(own.currentDueAt !== null && { currentDueAt: own.currentDueAt }),
    rescheduledCount: own.rescheduledCount,
    status,
    ...(progress !== undefined && { progress }),
    overdue: isOverdue(status, own.currentDueAt, now),
    ...(own.lastUpdateAt !== undefined && { lastUpdateAt: own.lastUpdateAt }),
    edited: item.edited,
    createdAt: item.createdAt,
  }
}

/**
 * What a parent amounts to, from its children alone (R5): its own updates
 * never set its status or progress. Progress is the mean of the active
 * children and is left out unless every one has a determinable value.
 */
function rollUp(children: readonly FollowThroughView[]): {
  status: FollowStatus
  progress: number | undefined
} {
  const active = children.filter((c) => c.status !== 'abandoned')
  if (active.length === 0) return { status: 'abandoned', progress: undefined }
  const status: FollowStatus = active.every((c) => c.status === 'completed')
    ? 'completed'
    : active.every((c) => c.status === 'planned')
      ? 'planned'
      : 'in_progress'
  const values = active.map((c) => c.progress)
  const progress = values.every((v): v is number => v !== undefined)
    ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
    : undefined
  return { status, progress }
}

/**
 * Builds the served tree. `items` must already be authorized and belong to one
 * cabildeo. A child counts only when its parent is a root of that cabildeo, so
 * nesting stops at one level (R4); anything deeper is dropped.
 */
export function buildFollowThroughTree(
  items: readonly FollowItem[],
  updates: readonly FollowUpdate[],
  options: {
    now: Date
    includeUpdates: boolean
    withdrawn?: ReadonlyMap<string, number>
  },
): FollowThroughView[] {
  const { now, includeUpdates, withdrawn } = options
  const updatesBySubject = new Map<string, FollowUpdate[]>()
  for (const update of updates) {
    const list = updatesBySubject.get(update.subject) ?? []
    list.push(update)
    updatesBySubject.set(update.subject, list)
  }

  const view = (
    item: FollowItem,
    overrides?: Parameters<typeof toView>[3],
  ): FollowThroughView => {
    const itemUpdates = updatesBySubject.get(item.uri) ?? []
    const built = toView(
      item,
      deriveOwnState(item, itemUpdates),
      now,
      overrides,
    )
    const lost = withdrawn?.get(item.uri) ?? 0
    if (lost > 0) built.withdrawnUpdates = lost
    if (includeUpdates) {
      built.updates = [...itemUpdates].sort(compareUpdates).map(toUpdateView)
    }
    return built
  }

  const byCreated = (a: FollowItem, b: FollowItem) =>
    a.createdAt.localeCompare(b.createdAt) || a.uri.localeCompare(b.uri)
  const roots = items.filter((item) => item.parent === null).sort(byCreated)
  const rootUris = new Set(roots.map((r) => r.uri))
  const childrenOf = new Map<string, FollowItem[]>()
  for (const item of items) {
    if (item.parent === null || !rootUris.has(item.parent)) continue
    const list = childrenOf.get(item.parent) ?? []
    list.push(item)
    childrenOf.set(item.parent, list)
  }

  return roots.map((root) => {
    const kids = (childrenOf.get(root.uri) ?? []).sort(byCreated)
    if (kids.length === 0) return view(root)
    const children = kids.map((kid) => view(kid))
    const built = view(root, rollUp(children))
    built.children = children
    return built
  })
}

/** Top-level counts for one cabildeo, computed from its served roots. */
export function summarizeFollowThrough(
  cabildeo: string,
  roots: readonly FollowThroughView[],
): FollowSummary {
  const active = roots.filter((r) => r.status !== 'abandoned')
  const progresses = active.map((r) => r.progress)
  const everything = roots.flatMap((r) => [r, ...(r.children ?? [])])
  const open = everything.filter(
    (i) => i.status !== 'completed' && i.status !== 'abandoned',
  )
  const dueDates = open.flatMap((i) => (i.currentDueAt ? [i.currentDueAt] : []))
  const updated = everything.flatMap((i) =>
    i.lastUpdateAt ? [i.lastUpdateAt] : [],
  )
  const hasProgress =
    active.length > 0 && progresses.every((p): p is number => p !== undefined)
  return {
    cabildeo,
    total: roots.length,
    completed: roots.filter((r) => r.status === 'completed').length,
    overdue: roots.filter((r) => r.overdue).length,
    abandoned: roots.length - active.length,
    ...(hasProgress && {
      progress: Math.round(
        (progresses as number[]).reduce((sum, p) => sum + p, 0) /
          progresses.length,
      ),
    }),
    ...(dueDates.length > 0 && { nextDueAt: [...dueDates].sort()[0] }),
    ...(updated.length > 0 && { lastUpdateAt: [...updated].sort().at(-1) }),
  }
}
