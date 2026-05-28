import { request } from 'undici'
import { AppBskyEmbedExternal } from '@atproto/api'
import { SeedClient } from './client.js'

export type ParaStrongRef = {
  uri: string
  cid: string
}

export type ParaPostType = 'policy' | 'matter' | 'meme'
export type CabildeoPhase =
  | 'draft'
  | 'open'
  | 'deliberating'
  | 'voting'
  | 'resolved'
export type CommunityMembershipState =
  | 'pending'
  | 'active'
  | 'left'
  | 'removed'
  | 'blocked'

const COM_PARA_POST = 'com.para.post'
const COM_PARA_COMMUNITY_BOARD = 'com.para.community.board'
const COM_PARA_COMMUNITY_MEMBERSHIP = 'com.para.community.membership'
const COM_PARA_COMMUNITY_GOVERNANCE = 'com.para.community.governance'
const COM_PARA_CIVIC_CABILDEO = 'com.para.civic.cabildeo'
const COM_PARA_CIVIC_POSITION = 'com.para.civic.position'
const COM_PARA_CIVIC_VOTE = 'com.para.civic.vote'
const COM_PARA_CIVIC_DELEGATION = 'com.para.civic.delegation'
const COM_PARA_SOCIAL_POST_META = 'com.para.social.postMeta'
const COM_PARA_STATUS = 'com.para.status'
const APP_BSKY_ACTOR_STATUS = 'app.bsky.actor.status'
const APP_BSKY_FEED_LIKE = 'app.bsky.feed.like'

export const createParaPost = async (
  sc: SeedClient,
  by: string,
  text: string,
  opts: {
    root?: ParaStrongRef
    parent?: ParaStrongRef
    reply?: {
      root: ParaStrongRef
      parent: ParaStrongRef
    }
    postType?: ParaPostType
    tags?: string[]
    flairs?: string[]
  } = {},
): Promise<ParaStrongRef> => {
  const reply =
    opts.reply ??
    (opts.root && opts.parent
      ? {
          root: opts.root,
          parent: opts.parent,
        }
      : undefined)
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_POST,
      record: {
        $type: COM_PARA_POST,
        text,
        createdAt: new Date().toISOString(),
        reply,
        postType: opts.postType,
        tags: opts.tags,
        flairs: opts.flairs,
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return {
    uri: data.uri,
    cid: data.cid,
  }
}

export const createParaCommunityBoard = async (
  sc: SeedClient,
  by: string,
  name: string,
): Promise<ParaStrongRef & { slug: string }> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_BOARD,
      record: {
        $type: COM_PARA_COMMUNITY_BOARD,
        name,
        description: `${name} community`,
        quadrant: 'political',
        status: 'active',
        delegatesChatId: '',
        subdelegatesChatId: '',
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  const rkey = data.uri.split('/').pop()!
  return {
    uri: data.uri,
    cid: data.cid,
    slug: `${normalizeBoardSlug(name)}-${rkey}`,
  }
}

export const normalizeBoardSlug = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const createCommunityBoardRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    name: string
    quadrant: string
    description?: string
    status?: 'draft' | 'active' | 'archived'
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_BOARD,
      record: {
        $type: COM_PARA_COMMUNITY_BOARD,
        name: opts.name,
        quadrant: opts.quadrant,
        delegatesChatId: `${opts.quadrant}-delegates`,
        subdelegatesChatId: `${opts.quadrant}-subdelegates`,
        status: opts.status ?? 'active',
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const createCommunityMembershipRecord = async (
  sc: SeedClient,
  by: string,
  community: string,
  membershipState: CommunityMembershipState,
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_MEMBERSHIP,
      record: {
        $type: COM_PARA_COMMUNITY_MEMBERSHIP,
        community,
        membershipState,
        joinedAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export type CommunityGovernanceRecord = {
  moderators: Array<{
    did?: string
    handle?: string
    displayName?: string
    role: string
    badge: string
    capabilities: string[]
  }>
  officials: Array<{
    did?: string
    handle?: string
    displayName?: string
    office: string
    mandate: string
  }>
  deputies: Array<{
    key: string
    tier: string
    role: string
    description: string
    capabilities: string[]
    activeHolder?: {
      did?: string
      handle?: string
      displayName?: string
    }
    votes: number
    applicants: Array<{
      did?: string
      handle?: string
      displayName?: string
      appliedAt: string
      status: 'applied' | 'approved' | 'rejected'
    }>
  }>
  metadata?: {
    reviewCadence?: string
    state?: string
    matterFlairIds?: string[]
    policyFlairIds?: string[]
  }
  editHistory?: Array<{
    id: string
    action: string
    createdAt: string
    summary: string
  }>
}

export const createCommunityGovernanceRecord = async (
  sc: SeedClient,
  by: string,
  community: string,
  record: CommunityGovernanceRecord,
): Promise<ParaStrongRef> => {
  const now = new Date().toISOString()
  const slug = community.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const { data } = await sc.agent.com.atproto.repo.putRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_GOVERNANCE,
      rkey: slug,
      record: {
        $type: COM_PARA_COMMUNITY_GOVERNANCE,
        community,
        slug,
        createdAt: now,
        updatedAt: now,
        moderators: record.moderators,
        officials: record.officials,
        deputies: record.deputies,
        metadata: record.metadata,
        editHistory: record.editHistory,
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return {
    uri: data.uri,
    cid: data.cid,
  }
}

export const createParaPostMeta = async (
  sc: SeedClient,
  by: string,
  postUri: string,
  opts: {
    postType: ParaPostType
    voteScore: number
    official?: boolean
    party?: string
    community?: string
    category?: string
    tags?: string[]
    flairs?: string[]
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_SOCIAL_POST_META,
      record: {
        $type: COM_PARA_SOCIAL_POST_META,
        post: postUri,
        postType: opts.postType,
        voteScore: opts.voteScore,
        official: opts.official,
        party: opts.party,
        community: opts.community,
        category: opts.category,
        tags: opts.tags,
        flairs: opts.flairs,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return {
    uri: data.uri,
    cid: data.cid,
  }
}

export const createParaStatus = async (
  sc: SeedClient,
  by: string,
  opts: {
    status: string
    party?: string
    community?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.putRecord(
    {
      repo: by,
      collection: COM_PARA_STATUS,
      rkey: 'self',
      record: {
        $type: COM_PARA_STATUS,
        status: opts.status,
        party: opts.party,
        community: opts.community,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return {
    uri: data.uri,
    cid: data.cid,
  }
}

export const likeParaRecord = async (
  sc: SeedClient,
  by: string,
  subject: ParaStrongRef,
): Promise<void> => {
  await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: APP_BSKY_FEED_LIKE,
      record: {
        $type: APP_BSKY_FEED_LIKE,
        subject,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
}

export const createCabildeoRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    title: string
    description: string
    community: string
    phase: CabildeoPhase
    options: Array<{ label: string; description?: string }>
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_CIVIC_CABILDEO,
      record: {
        $type: COM_PARA_CIVIC_CABILDEO,
        title: opts.title,
        description: opts.description,
        community: opts.community,
        phase: opts.phase,
        options: opts.options,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const createCabildeoPositionRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    cabildeo: string
    stance: 'for' | 'against' | 'amendment'
    optionIndex?: number
    text: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_CIVIC_POSITION,
      record: {
        $type: COM_PARA_CIVIC_POSITION,
        cabildeo: opts.cabildeo,
        stance: opts.stance,
        optionIndex: opts.optionIndex,
        text: opts.text,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const createCabildeoVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    cabildeo: string
    selectedOption: number
    isDirect: boolean
    voteNullifier?: string
    eligibilityProofRef?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_CIVIC_VOTE,
      record: {
        $type: COM_PARA_CIVIC_VOTE,
        subject: opts.cabildeo,
        subjectType: 'cabildeo',
        cabildeo: opts.cabildeo,
        selectedOption: opts.selectedOption,
        isDirect: opts.isDirect,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const createCabildeoDelegationRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    cabildeo?: string
    delegateTo: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_CIVIC_DELEGATION,
      record: {
        $type: COM_PARA_CIVIC_DELEGATION,
        cabildeo: opts.cabildeo,
        delegateTo: opts.delegateTo,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const createLiveStatusRecord = async (
  sc: SeedClient,
  by: string,
  opts: { uri: string; durationMinutes?: number },
): Promise<ParaStrongRef> => {
  const embed: AppBskyEmbedExternal.Main = {
    $type: 'app.bsky.embed.external',
    external: {
      uri: opts.uri,
      title: 'Live room',
      description: 'Live cabildeo room',
    },
  }

  const { data } = await sc.agent.com.atproto.repo.putRecord(
    {
      repo: by,
      collection: APP_BSKY_ACTOR_STATUS,
      rkey: 'self',
      record: {
        $type: APP_BSKY_ACTOR_STATUS,
        status: 'app.bsky.actor.status#live',
        embed,
        durationMinutes: opts.durationMinutes ?? 10,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

export const putCabildeoLivePresence = async (
  network: {
    bsky: { url: string }
    serviceHeaders(did: string, lxm: string): Promise<Record<string, string>>
  },
  by: string,
  opts: {
    cabildeo: string
    sessionId: string
  },
): Promise<{ status: number; body: unknown }> => {
  const authHeaders = await network.serviceHeaders(
    by,
    'com.para.civic.putLivePresence',
  )
  const res = await request(
    new URL('/xrpc/com.para.civic.putLivePresence', network.bsky.url),
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify(opts),
    },
  )

  return {
    status: res.statusCode,
    body: await res.body.json(),
  }
}

export const writeParaFixture = async <T>(
  network: { processAll(): Promise<void> },
  write: () => Promise<T>,
): Promise<T> => {
  const result = await write()
  await network.processAll()
  return result
}

// QV-LD Records
const COM_PARA_COMMUNITY_VOTE = 'com.para.community.vote'
const COM_PARA_COMMUNITY_INTENSITY = 'com.para.community.intensity'
const COM_PARA_COMMUNITY_DELEGATION = 'com.para.community.delegation'
const COM_PARA_COMMUNITY_DELIBERATION = 'com.para.community.deliberation'
const COM_PARA_COMMUNITY_DELIBERATION_VOTE =
  'com.para.community.deliberationVote'

export const createQvlVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    proposal: string
    community: string
    signal: number
    voteNullifier?: string
    eligibilityProofRef?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_VOTE,
      record: {
        $type: COM_PARA_COMMUNITY_VOTE,
        proposal: opts.proposal,
        community: opts.community,
        voter: by,
        signal: opts.signal,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createQvlIntensityRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    proposal: string
    voter: string
    signal: number
    units: number
    creditsSpent?: number
    delegatedFrom?: string[]
    delegationDepth?: number
    effectiveWeight?: string
    voteNullifier?: string
    eligibilityProofRef?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_INTENSITY,
      record: {
        $type: COM_PARA_COMMUNITY_INTENSITY,
        proposal: opts.proposal,
        voter: opts.voter,
        signal: opts.signal,
        units: opts.units,
        creditsSpent: opts.creditsSpent ?? opts.units,
        delegatedFrom: opts.delegatedFrom,
        delegationDepth: opts.delegationDepth ?? 0,
        effectiveWeight: opts.effectiveWeight,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createQvlDelegationRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    delegate: string
    delegator: string
    delegateRole?: string
    party?: string
    scope: {
      mode: string
      community?: string
      topic?: string
      proposal?: string
    }
    expiresAt?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_DELEGATION,
      record: {
        $type: COM_PARA_COMMUNITY_DELEGATION,
        delegate: opts.delegate,
        delegator: opts.delegator,
        delegateRole: opts.delegateRole,
        party: opts.party,
        scope: opts.scope,
        expiresAt: opts.expiresAt,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createQvlDeliberationRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    proposal: string
    community: string
    body: string
    stance?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_DELIBERATION,
      record: {
        $type: COM_PARA_COMMUNITY_DELIBERATION,
        proposal: opts.proposal,
        community: opts.community,
        author: by,
        body: opts.body,
        stance: opts.stance ?? 'neutral',
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createQvlDeliberationVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    deliberation: string
    voter: string
    direction: 'agree' | 'disagree' | 'pass'
    voteNullifier?: string
    eligibilityProofRef?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_COMMUNITY_DELIBERATION_VOTE,
      record: {
        $type: COM_PARA_COMMUNITY_DELIBERATION_VOTE,
        deliberation: opts.deliberation,
        voter: opts.voter,
        direction: opts.direction,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

// RAQ Records
const COM_PARA_RAQ_ASSESSMENT = 'com.para.raq.assessment'
const COM_PARA_RAQ_AXIS_VOTE = 'com.para.raq.axisVote'
const COM_PARA_RAQ_PROPOSAL = 'com.para.raq.proposal'

export const createRaqAssessmentRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    answers: { questionId: string; value: number }[]
    results: {
      axisId: string
      axisTitle: string
      score: number
      label: string
      labelLow?: string
      labelHigh?: string
      rawScore?: number
    }[]
    compass: { x: number; y: number; ninth: string }
    ideology: { name: string; description: string; matchPercent: number }
    secondaryIdeology?: {
      name: string
      description: string
      matchPercent: number
    }
    partyMatches?: {
      partyId: string
      partyName: string
      partyFullName?: string
      partyColor?: string
      matchPercent: number
    }[]
    isPublic?: boolean
    version?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_RAQ_ASSESSMENT,
      record: {
        $type: COM_PARA_RAQ_ASSESSMENT,
        answers: opts.answers,
        results: opts.results,
        compass: opts.compass,
        ideology: opts.ideology,
        secondaryIdeology: opts.secondaryIdeology,
        partyMatches: opts.partyMatches,
        isPublic: opts.isPublic ?? true,
        completedAt: new Date().toISOString(),
        version: opts.version ?? '1.0',
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createRaqAxisVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    axisId: string
    value?: number
    voteNullifier?: string
    eligibilityProofRef?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_RAQ_AXIS_VOTE,
      record: {
        $type: COM_PARA_RAQ_AXIS_VOTE,
        axisId: opts.axisId,
        value: opts.value ?? 1,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}

export const createRaqProposalRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    text: string
    targetAxis?: string
    targetCommunity?: string
  },
): Promise<ParaStrongRef> => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: COM_PARA_RAQ_PROPOSAL,
      record: {
        $type: COM_PARA_RAQ_PROPOSAL,
        text: opts.text,
        targetAxis: opts.targetAxis,
        targetCommunity: opts.targetCommunity,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )
  return { uri: data.uri, cid: data.cid }
}
