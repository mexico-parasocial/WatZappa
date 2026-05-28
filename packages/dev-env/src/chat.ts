import events from 'node:events'
import http from 'node:http'
import * as plc from '@did-plc/lib'
import express from 'express'
import getPort from 'get-port'
import {
  type $Typed,
  AtpAgent,
  ChatBskyActorDefs,
  ChatBskyConvoDefs,
} from '@atproto/api'
import { Secp256k1Keypair } from '@atproto/crypto'
import { IdResolver } from '@atproto/identity'
import { createLexiconServer } from '@atproto/pds'
import {
  AuthRequiredError,
  InvalidRequestError,
  parseReqNsid,
  verifyJwt,
} from '@atproto/xrpc-server'

type ConvoStatus = 'request' | 'accepted'

type ServiceAuth = {
  did: string
}

type MessageInput = {
  text: string
  facets?: ChatBskyConvoDefs.MessageInput['facets']
  embed?: ChatBskyConvoDefs.MessageInput['embed']
}

type InternalReaction = {
  value: string
  senderDid: string
  createdAt: string
}

type InternalMessage = {
  id: string
  rev: string
  text: string
  facets?: ChatBskyConvoDefs.MessageInput['facets']
  embed?: ChatBskyConvoDefs.MessageInput['embed']
  senderDid: string
  sentAt: string
  reactions: InternalReaction[]
}

type InternalMemberState = {
  status: ConvoStatus
  muted: boolean
  left: boolean
  deletedMessageIds: Set<string>
  lastReadMessageId?: string
}

type InternalJoinLink = {
  code: string
  enabledStatus: 'enabled' | 'disabled'
  requireApproval: boolean
  joinRule: string
  createdAt: string
}

type InternalConvo = {
  id: string
  key: string
  rev: string
  kind: 'direct' | 'group'
  name?: string
  ownerDid?: string
  memberDids: string[]
  memberStates: Map<string, InternalMemberState>
  messages: InternalMessage[]
  sizeLimit?: number
  locked?: boolean
  joinLink?: InternalJoinLink
}

type InternalLog =
  | {
      type: 'begin'
      rev: string
      convoId: string
    }
  | {
      type: 'accept'
      rev: string
      convoId: string
    }
  | {
      type: 'leave'
      rev: string
      convoId: string
    }
  | {
      type: 'mute'
      rev: string
      convoId: string
    }
  | {
      type: 'unmute'
      rev: string
      convoId: string
    }
  | {
      type: 'create-message'
      rev: string
      convoId: string
      messageId: string
    }
  | {
      type: 'delete-message'
      rev: string
      convoId: string
      messageId: string
    }
  | {
      type: 'read-message'
      rev: string
      convoId: string
      messageId: string
    }
  | {
      type: 'add-reaction'
      rev: string
      convoId: string
      messageId: string
      senderDid: string
      value: string
    }
  | {
      type: 'remove-reaction'
      rev: string
      convoId: string
      messageId: string
      senderDid: string
      value: string
    }

export type TestChatConfig = {
  plcUrl?: string
  port?: number
  serviceDid?: string
  serverDid?: string
  pds?: unknown
}

export class TestChat {
  destroyed = false
  private readonly idResolver: IdResolver
  private readonly profileCache = new Map<
    string,
    ChatBskyActorDefs.ProfileViewBasic
  >()
  private readonly convos = new Map<string, InternalConvo>()
  private readonly convoKeys = new Map<string, string>()
  private readonly logs: InternalLog[] = []
  private revSeq = 0
  private convoSeq = 0
  private messageSeq = 0

  constructor(
    public url: string,
    public port: number,
    public server: http.Server,
    public did: string,
    plcUrl: string,
  ) {
    this.idResolver = new IdResolver({ plcUrl })
  }

  static async create(config: TestChatConfig): Promise<TestChat> {
    const plcUrl = getPlcUrl(config)
    if (!plcUrl) {
      throw new Error(
        'TestChat requires plcUrl or a TestPds instance with a PLC URL',
      )
    }
    const port = config.port || (await getPort())
    const did =
      config.serviceDid ||
      config.serverDid ||
      (await createChatDid(plcUrl, port))
    const url = `http://localhost:${port}`
    const app = express()
    const lexServer = createLexiconServer({
      validateResponse: false,
      payload: {
        jsonLimit: 150 * 1024,
        textLimit: 150 * 1024,
        blobLimit: 5 * 1024 * 1024,
      },
    })
    const server = http.createServer(app)
    const chat = new TestChat(url, port, server, did, plcUrl)

    lexServer.chat.bsky.actor.deleteAccount(async (args) => {
      await chat.requireAuth(args.req)
      return {
        encoding: 'application/json',
        body: {},
      }
    })

    lexServer.chat.bsky.convo.getConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(args.params.convoId, auth.did)
      return {
        encoding: 'application/json',
        body: { convo: await chat.toConvoView(convo, auth.did) },
      }
    })

    lexServer.chat.bsky.convo.getConvoAvailability(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const memberDids = normalizeMemberList(args.params.members, auth.did)
      const convo = chat.findConvoByMembers(memberDids)
      return {
        encoding: 'application/json',
        body: convo
          ? {
              canChat: true,
              convo: await chat.toConvoView(convo, auth.did),
            }
          : {
              canChat: true,
            },
      }
    })

    lexServer.chat.bsky.convo.getConvoForMembers(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.getOrCreateConvo(
        normalizeMemberList(args.params.members, auth.did),
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      if (memberState.left) {
        memberState.left = false
      }
      return {
        encoding: 'application/json',
        body: { convo: await chat.toConvoView(convo, auth.did) },
      }
    })

    lexServer.chat.bsky.convo.getConvoMembers(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(args.params.convoId, auth.did)
      const members = await chat.toConvoMembers(convo)
      const limit = clampLimit(args.params.limit, 100)
      const offset = decodeCursor(args.params.cursor)
      const slice = members.slice(offset, offset + limit)
      return {
        encoding: 'application/json',
        body: {
          cursor:
            offset + limit < members.length
              ? encodeCursor(offset + limit)
              : undefined,
          members: slice,
        },
      }
    })

    lexServer.chat.bsky.convo.listConvos(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const status = normalizeStatus(args.params.status)
      const readState = normalizeReadState(args.params.readState)
      const limit = clampLimit(args.params.limit, 100)
      const visible = await chat.listVisibleConvos(auth.did, {
        readState,
        status,
      })
      const offset = decodeCursor(args.params.cursor)
      const slice = visible.slice(offset, offset + limit)
      return {
        encoding: 'application/json',
        body: {
          cursor:
            offset + limit < visible.length
              ? encodeCursor(offset + limit)
              : undefined,
          convos: slice,
        },
      }
    })

    lexServer.chat.bsky.convo.getMessages(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(args.params.convoId, auth.did)
      const messages = chat.getVisibleMessages(convo, auth.did)
      const limit = clampLimit(args.params.limit, 100)
      const offset = decodeCursor(args.params.cursor)
      const slice = messages.slice(offset, offset + limit)
      return {
        encoding: 'application/json',
        body: {
          cursor:
            offset + limit < messages.length
              ? encodeCursor(offset + limit)
              : undefined,
          messages: slice,
        } as any,
      }
    })

    lexServer.chat.bsky.convo.getLog(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const cursor = args.params.cursor
      const visibleLogs = chat.logs
        .filter((log) => chat.canViewLog(log, auth.did))
        .filter((log) => (cursor ? log.rev > cursor : true))
      return {
        encoding: 'application/json',
        body: {
          cursor: visibleLogs.length
            ? visibleLogs[visibleLogs.length - 1]?.rev
            : cursor,
          logs: visibleLogs.map((log) => chat.toLogView(log, auth.did)),
        } as any,
      }
    })

    lexServer.chat.bsky.convo.sendMessage(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
        {
          allowLeft: true,
        },
      )
      const message = chat.appendMessage(
        convo,
        auth.did,
        chat.parseMessageInput(args.input.body.message),
      )
      return {
        encoding: 'application/json',
        body: message,
      }
    })

    lexServer.chat.bsky.convo.sendMessageBatch(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const items = Array.isArray(args.input.body.items)
        ? args.input.body.items
        : []
      const written = items.map((item) => {
        const convo = chat.requireAccessibleConvo(item.convoId, auth.did, {
          allowLeft: true,
        })
        return chat.appendMessage(
          convo,
          auth.did,
          chat.parseMessageInput(item.message),
        )
      })
      return {
        encoding: 'application/json',
        body: { items: written },
      }
    })

    lexServer.chat.bsky.convo.acceptConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      if (memberState.status === 'accepted') {
        return {
          encoding: 'application/json',
          body: {},
        }
      }
      memberState.status = 'accepted'
      const rev = chat.bumpConvoRev(convo)
      chat.logs.push({
        type: 'accept',
        rev,
        convoId: convo.id,
      })
      return {
        encoding: 'application/json',
        body: { rev },
      }
    })

    lexServer.chat.bsky.convo.leaveConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      memberState.left = true
      const rev = chat.bumpConvoRev(convo)
      chat.logs.push({
        type: 'leave',
        rev,
        convoId: convo.id,
      })
      return {
        encoding: 'application/json',
        body: {
          convoId: convo.id,
          rev,
        },
      }
    })

    lexServer.chat.bsky.convo.muteConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      memberState.muted = true
      const rev = chat.bumpConvoRev(convo)
      chat.logs.push({
        type: 'mute',
        rev,
        convoId: convo.id,
      })
      return {
        encoding: 'application/json',
        body: {
          convo: await chat.toConvoView(convo, auth.did),
        },
      }
    })

    lexServer.chat.bsky.convo.unmuteConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      memberState.muted = false
      const rev = chat.bumpConvoRev(convo)
      chat.logs.push({
        type: 'unmute',
        rev,
        convoId: convo.id,
      })
      return {
        encoding: 'application/json',
        body: {
          convo: await chat.toConvoView(convo, auth.did),
        },
      }
    })

    lexServer.chat.bsky.convo.updateRead(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      const target = chat.resolveReadTarget(
        convo,
        auth.did,
        args.input.body.messageId,
      )
      if (target) {
        memberState.lastReadMessageId = target.id
        const rev = chat.bumpConvoRev(convo)
        chat.logs.push({
          type: 'read-message',
          rev,
          convoId: convo.id,
          messageId: target.id,
        })
      }
      return {
        encoding: 'application/json',
        body: {
          convo: await chat.toConvoView(convo, auth.did),
        },
      }
    })

    lexServer.chat.bsky.convo.updateAllRead(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const status = normalizeStatus(args.input.body.status)
      let updatedCount = 0
      for (const convo of chat.convos.values()) {
        if (!chat.isConvoVisibleTo(convo, auth.did)) continue
        const memberState = chat.getMemberState(convo, auth.did)
        if (status && memberState.status !== status) continue
        const target = chat.resolveReadTarget(convo, auth.did)
        if (!target) continue
        memberState.lastReadMessageId = target.id
        const rev = chat.bumpConvoRev(convo)
        chat.logs.push({
          type: 'read-message',
          rev,
          convoId: convo.id,
          messageId: target.id,
        })
        updatedCount += 1
      }
      return {
        encoding: 'application/json',
        body: { updatedCount },
      }
    })

    lexServer.chat.bsky.convo.deleteMessageForSelf(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      const message = chat.requireMessage(convo, args.input.body.messageId)
      memberState.deletedMessageIds.add(message.id)
      const rev = chat.bumpConvoRev(convo)
      chat.logs.push({
        type: 'delete-message',
        rev,
        convoId: convo.id,
        messageId: message.id,
      })
      return {
        encoding: 'application/json',
        body: chat.toDeletedMessageView(message, rev),
      }
    })

    lexServer.chat.bsky.convo.addReaction(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      const value = normalizeReactionValue(args.input.body.value)
      const message = chat.requireMessage(convo, args.input.body.messageId)
      if (memberState.deletedMessageIds.has(message.id)) {
        return {
          status: 400,
          error: 'ReactionMessageDeleted',
          message: 'cannot react to a deleted message',
        }
      }
      if (
        !message.reactions.find(
          (reaction) =>
            reaction.senderDid === auth.did && reaction.value === value,
        ) &&
        message.reactions.length >= 20
      ) {
        return {
          status: 400,
          error: 'ReactionLimitReached',
          message: 'reaction limit reached',
        }
      }
      message.reactions = message.reactions.filter(
        (reaction) =>
          !(reaction.senderDid === auth.did && reaction.value === value),
      )
      const createdAt = new Date().toISOString()
      message.reactions.push({
        value,
        senderDid: auth.did,
        createdAt,
      })
      message.reactions.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
      const rev = chat.bumpConvoRev(convo)
      message.rev = rev
      chat.logs.push({
        type: 'add-reaction',
        rev,
        convoId: convo.id,
        messageId: message.id,
        senderDid: auth.did,
        value,
      })
      return {
        encoding: 'application/json',
        body: {
          message: chat.toMessageView(message),
        },
      }
    })

    lexServer.chat.bsky.convo.removeReaction(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      const memberState = chat.getMemberState(convo, auth.did)
      const value = normalizeReactionValue(args.input.body.value)
      const message = chat.requireMessage(convo, args.input.body.messageId)
      if (memberState.deletedMessageIds.has(message.id)) {
        return {
          status: 400,
          error: 'ReactionMessageDeleted',
          message: 'cannot react to a deleted message',
        }
      }
      message.reactions = message.reactions.filter(
        (reaction) =>
          !(reaction.senderDid === auth.did && reaction.value === value),
      )
      const rev = chat.bumpConvoRev(convo)
      message.rev = rev
      chat.logs.push({
        type: 'remove-reaction',
        rev,
        convoId: convo.id,
        messageId: message.id,
        senderDid: auth.did,
        value,
      })
      return {
        encoding: 'application/json',
        body: {
          message: chat.toMessageView(message),
        },
      }
    })

    lexServer.chat.bsky.convo.lockConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      if (convo.kind !== 'group') {
        throw new InvalidRequestError(
          'cannot lock a direct convo',
          'InvalidConvo',
        )
      }
      if (convo.ownerDid !== auth.did) {
        throw new AuthRequiredError('only the owner can lock the convo')
      }
      convo.locked = true
      chat.bumpConvoRev(convo)
      return {
        encoding: 'application/json',
        body: { convo: await chat.toConvoView(convo, auth.did) },
      }
    })

    lexServer.chat.bsky.convo.unlockConvo(async (args) => {
      const auth = await chat.requireAuth(args.req)
      const convo = chat.requireAccessibleConvo(
        args.input.body.convoId,
        auth.did,
      )
      if (convo.kind !== 'group') {
        throw new InvalidRequestError(
          'cannot unlock a direct convo',
          'InvalidConvo',
        )
      }
      if (convo.ownerDid !== auth.did) {
        throw new AuthRequiredError('only the owner can unlock the convo')
      }
      convo.locked = false
      chat.bumpConvoRev(convo)
      return {
        encoding: 'application/json',
        body: { convo: await chat.toConvoView(convo, auth.did) },
      }
    })

    if (lexServer.com.para.community) {
      lexServer.com.para.community.createBoard(async (args) => {
        const auth = await chat.requireAuth(args.req)

        // MOCK: Generate the two specific groups required for PARA communities
        const delConvo = chat.createGroupConvo(auth.did, 'Delegates', [], 270)
        const subConvo = chat.createGroupConvo(auth.did, 'Subdelegates', [], 30)

        // Normally would insert com.para.community.board to repo, just returning mock for now
        return {
          encoding: 'application/json',
          body: {
            uri: `at://${auth.did}/com.para.community.board/mocktest`,
            cid: 'bafyreimocktest',
            delegatesChatId: delConvo.id,
            subdelegatesChatId: subConvo.id,
          },
        }
      })
    }

    if (lexServer.chat.bsky.group) {
      lexServer.chat.bsky.group.createGroup(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.createGroupConvo(
          auth.did,
          args.input.body.name,
          args.input.body.members,
          100,
        )
        return {
          encoding: 'application/json',
          body: { convo: await chat.toConvoView(convo, auth.did) },
        }
      })

      lexServer.chat.bsky.group.addMembers(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )

        const newMembers = args.input.body.members
        const totalSize = convo.memberDids.length + newMembers.length

        if (convo.sizeLimit && totalSize > convo.sizeLimit) {
          return {
            status: 400,
            error: 'MemberLimitReached',
            message: `Group size limit exceeded. Max is ${convo.sizeLimit}`,
          }
        }

        for (const did of newMembers) {
          if (!convo.memberDids.includes(did)) {
            convo.memberDids.push(did)
            convo.memberStates.set(did, {
              status: 'request',
              muted: false,
              left: false,
              deletedMessageIds: new Set(),
            })
          }
        }

        return {
          encoding: 'application/json',
          body: { convo: await chat.toConvoView(convo, auth.did) },
        }
      })

      lexServer.chat.bsky.group.removeMembers(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can remove members')
        }
        for (const did of args.input.body.members) {
          convo.memberDids = convo.memberDids.filter((m) => m !== did)
          convo.memberStates.delete(did)
        }
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { convo: await chat.toConvoView(convo, auth.did) },
        }
      })

      lexServer.chat.bsky.group.editGroup(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can edit the group')
        }
        convo.name = args.input.body.name
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { convo: await chat.toConvoView(convo, auth.did) },
        }
      })

      lexServer.chat.bsky.group.createJoinLink(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can create a join link')
        }
        if (convo.joinLink) {
          throw new InvalidRequestError(
            'join link already exists',
            'EnabledJoinLinkAlreadyExists',
          )
        }
        const joinLink = {
          code: `link-${Math.random().toString(36).slice(2, 8)}`,
          enabledStatus: 'enabled' as const,
          requireApproval: args.input.body.requireApproval ?? false,
          joinRule: (args.input.body.joinRule ?? 'anyone') as string,
          createdAt: new Date().toISOString(),
        }
        convo.joinLink = joinLink
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { joinLink },
        }
      })

      lexServer.chat.bsky.group.disableJoinLink(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError(
            'only the owner can disable the join link',
          )
        }
        if (!convo.joinLink) {
          throw new InvalidRequestError('no join link exists', 'NoJoinLink')
        }
        convo.joinLink.enabledStatus = 'disabled'
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { joinLink: convo.joinLink },
        }
      })

      lexServer.chat.bsky.group.enableJoinLink(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can enable the join link')
        }
        if (!convo.joinLink) {
          throw new InvalidRequestError('no join link exists', 'NoJoinLink')
        }
        if (convo.joinLink.enabledStatus === 'enabled') {
          throw new InvalidRequestError(
            'link already enabled',
            'LinkAlreadyEnabled',
          )
        }
        convo.joinLink.enabledStatus = 'enabled'
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { joinLink: convo.joinLink },
        }
      })

      lexServer.chat.bsky.group.editJoinLink(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(
          args.input.body.convoId,
          auth.did,
        )
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can edit the join link')
        }
        if (!convo.joinLink) {
          throw new InvalidRequestError('no join link exists', 'NoJoinLink')
        }
        if (args.input.body.requireApproval !== undefined) {
          convo.joinLink.requireApproval = args.input.body.requireApproval
        }
        if (args.input.body.joinRule) {
          convo.joinLink.joinRule = args.input.body.joinRule as string
        }
        chat.bumpConvoRev(convo)
        return {
          encoding: 'application/json',
          body: { joinLink: convo.joinLink },
        }
      })

      lexServer.chat.bsky.group.listJoinRequests(async (args) => {
        const auth = await chat.requireAuth(args.req)
        const convo = chat.requireAccessibleConvo(args.params.convoId, auth.did)
        if (convo.kind !== 'group') {
          throw new InvalidRequestError('not a group convo', 'InvalidConvo')
        }
        if (convo.ownerDid !== auth.did) {
          throw new AuthRequiredError('only the owner can list join requests')
        }
        // Dev env: no persistent join requests, return empty
        return {
          encoding: 'application/json',
          body: { requests: [] },
        }
      })
    }

    app.use(lexServer.xrpc.router)
    server.listen(port)
    await events.once(server, 'listening')
    return chat
  }

  getClient(): AtpAgent {
    return new AtpAgent({ service: this.url })
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) return resolve()
      this.server.close((err) => {
        if (err) return reject(err)
        this.destroyed = true
        resolve()
      })
    })
  }

  private async requireAuth(req: express.Request): Promise<ServiceAuth> {
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      throw new AuthRequiredError('missing jwt', 'MissingJwt')
    }
    const token = authorization.slice('Bearer '.length).trim()
    const nsid = parseReqNsid(req)
    const payload = await verifyJwt(
      token,
      this.did,
      nsid,
      async (did: string, forceRefresh?: boolean) => {
        const atprotoData = await this.idResolver.did.resolveAtprotoData(
          did,
          Boolean(forceRefresh),
        )
        return atprotoData.signingKey
      },
    )
    return { did: payload.iss }
  }

  private parseMessageInput(input: MessageInput): MessageInput {
    if (!input || typeof input.text !== 'string') {
      throw new InvalidRequestError('message text is required')
    }
    return {
      text: input.text,
      facets: Array.isArray(input.facets)
        ? (input.facets as ChatBskyConvoDefs.MessageInput['facets'])
        : undefined,
      embed: input.embed,
    }
  }

  private getOrCreateConvo(
    memberDids: string[],
    requesterDid: string,
  ): InternalConvo {
    const key = convoKey(memberDids)
    const existingId = this.convoKeys.get(key)
    if (existingId) {
      const existing = this.requireConvo(existingId)
      const requester = this.getMemberState(existing, requesterDid)
      requester.left = false
      return existing
    }

    const id = `convo-${++this.convoSeq}`
    const rev = this.nextRev()
    const memberStates = new Map<string, InternalMemberState>()
    for (const did of memberDids) {
      memberStates.set(did, {
        status: did === requesterDid ? 'accepted' : 'request',
        muted: false,
        left: false,
        deletedMessageIds: new Set(),
      })
    }
    const convo: InternalConvo = {
      id,
      key,
      rev,
      kind: 'direct',
      memberDids,
      memberStates,
      messages: [],
    }
    this.convos.set(id, convo)
    this.convoKeys.set(key, id)
    this.logs.push({
      type: 'begin',
      rev,
      convoId: id,
    })
    return convo
  }

  createGroupConvo(
    ownerDid: string,
    name = 'Group chat',
    memberDids: string[] = [],
    sizeLimit = 100,
  ): InternalConvo {
    const id = `group-${++this.convoSeq}`
    const rev = this.nextRev()
    const memberStates = new Map<string, InternalMemberState>()
    const allMemberDids = normalizeMemberList(memberDids, ownerDid)
    memberStates.set(ownerDid, {
      status: 'accepted',
      muted: false,
      left: false,
      deletedMessageIds: new Set(),
    })
    for (const did of allMemberDids) {
      if (did === ownerDid) continue
      memberStates.set(did, {
        status: 'request',
        muted: false,
        left: false,
        deletedMessageIds: new Set(),
      })
    }
    const convo: InternalConvo = {
      id,
      key: id, // unique key, bypassing member based key deduplication
      rev,
      kind: 'group',
      name,
      ownerDid,
      memberDids: allMemberDids,
      memberStates,
      messages: [],
      sizeLimit,
    }
    this.convos.set(id, convo)
    this.convoKeys.set(id, id)
    this.logs.push({
      type: 'begin',
      rev,
      convoId: id,
    })
    return convo
  }

  private findConvoByMembers(memberDids: string[]): InternalConvo | undefined {
    const convoId = this.convoKeys.get(convoKey(memberDids))
    return convoId ? this.convos.get(convoId) : undefined
  }

  private requireConvo(convoId: string): InternalConvo {
    const convo = this.convos.get(convoId)
    if (!convo) {
      throw new InvalidRequestError('unknown convo', 'NotFound')
    }
    return convo
  }

  private requireAccessibleConvo(
    convoId: string,
    did: string,
    opts?: { allowLeft?: boolean },
  ): InternalConvo {
    const convo = this.requireConvo(convoId)
    const memberState = convo.memberStates.get(did)
    if (!memberState) {
      throw new AuthRequiredError('not a conversation member')
    }
    if (memberState.left && !opts?.allowLeft) {
      throw new InvalidRequestError('conversation not found', 'NotFound')
    }
    return convo
  }

  private requireMessage(
    convo: InternalConvo,
    messageId: string,
  ): InternalMessage {
    const message = convo.messages.find((item) => item.id === messageId)
    if (!message) {
      throw new InvalidRequestError('unknown message', 'NotFound')
    }
    return message
  }

  private getMemberState(
    convo: InternalConvo,
    did: string,
  ): InternalMemberState {
    const memberState = convo.memberStates.get(did)
    if (!memberState) {
      throw new AuthRequiredError('not a conversation member')
    }
    return memberState
  }

  private appendMessage(
    convo: InternalConvo,
    senderDid: string,
    input: MessageInput,
  ): ChatBskyConvoDefs.MessageView {
    const senderState = this.getMemberState(convo, senderDid)
    senderState.left = false
    senderState.status = 'accepted'
    const now = new Date().toISOString()
    const rev = this.bumpConvoRev(convo)
    const message: InternalMessage = {
      id: `msg-${++this.messageSeq}`,
      rev,
      text: input.text,
      facets: input.facets,
      embed: input.embed,
      senderDid,
      sentAt: now,
      reactions: [],
    }
    convo.messages.push(message)
    senderState.lastReadMessageId = message.id
    this.logs.push({
      type: 'create-message',
      rev,
      convoId: convo.id,
      messageId: message.id,
    })
    return this.toMessageView(message)
  }

  private resolveReadTarget(
    convo: InternalConvo,
    viewerDid: string,
    messageId?: string,
  ): InternalMessage | undefined {
    if (messageId) {
      return this.requireMessage(convo, messageId)
    }
    const visible = this.getVisibleMessageModels(convo, viewerDid)
    return visible[0]
  }

  private isConvoVisibleTo(convo: InternalConvo, did: string): boolean {
    const state = convo.memberStates.get(did)
    return Boolean(state && !state.left)
  }

  private async listVisibleConvos(
    did: string,
    opts: {
      readState?: 'unread'
      status?: ConvoStatus
    },
  ): Promise<ChatBskyConvoDefs.ConvoView[]> {
    const sorted = [...this.convos.values()].sort((left, right) =>
      right.rev.localeCompare(left.rev),
    )
    const result: ChatBskyConvoDefs.ConvoView[] = []
    for (const convo of sorted) {
      if (!this.isConvoVisibleTo(convo, did)) continue
      const memberState = this.getMemberState(convo, did)
      if (opts.status && memberState.status !== opts.status) continue
      const unreadCount = this.getUnreadCount(convo, did)
      if (opts.readState === 'unread' && unreadCount < 1) continue
      result.push(await this.toConvoView(convo, did))
    }
    return result
  }

  private getVisibleMessages(
    convo: InternalConvo,
    viewerDid: string,
  ): Array<
    | $Typed<ChatBskyConvoDefs.MessageView>
    | $Typed<ChatBskyConvoDefs.DeletedMessageView>
  > {
    return [...convo.messages]
      .sort((left, right) => right.rev.localeCompare(left.rev))
      .map((message) => this.toVisibleMessage(message, convo, viewerDid))
  }

  private getVisibleMessageModels(
    convo: InternalConvo,
    viewerDid: string,
  ): InternalMessage[] {
    const deleted = this.getMemberState(convo, viewerDid).deletedMessageIds
    return [...convo.messages]
      .filter((message) => !deleted.has(message.id))
      .sort((left, right) => right.rev.localeCompare(left.rev))
  }

  private getUnreadCount(convo: InternalConvo, viewerDid: string): number {
    const memberState = this.getMemberState(convo, viewerDid)
    const visible = this.getVisibleMessageModels(convo, viewerDid)
    if (!visible.length) return 0
    if (!memberState.lastReadMessageId) {
      return visible.filter((message) => message.senderDid !== viewerDid).length
    }
    let unreadCount = 0
    for (const message of visible) {
      if (message.id === memberState.lastReadMessageId) {
        break
      }
      if (message.senderDid !== viewerDid) {
        unreadCount += 1
      }
    }
    return unreadCount
  }

  private canViewLog(log: InternalLog, viewerDid: string): boolean {
    const convo = this.convos.get(log.convoId)
    if (!convo) return false
    return this.isConvoVisibleTo(convo, viewerDid)
  }

  private toLogView(
    log: InternalLog,
    viewerDid: string,
  ):
    | $Typed<ChatBskyConvoDefs.LogBeginConvo>
    | $Typed<ChatBskyConvoDefs.LogAcceptConvo>
    | $Typed<ChatBskyConvoDefs.LogLeaveConvo>
    | $Typed<ChatBskyConvoDefs.LogMuteConvo>
    | $Typed<ChatBskyConvoDefs.LogUnmuteConvo>
    | $Typed<ChatBskyConvoDefs.LogCreateMessage>
    | $Typed<ChatBskyConvoDefs.LogDeleteMessage>
    | $Typed<ChatBskyConvoDefs.LogReadMessage>
    | $Typed<ChatBskyConvoDefs.LogAddReaction>
    | $Typed<ChatBskyConvoDefs.LogRemoveReaction> {
    const base = {
      rev: log.rev,
      convoId: log.convoId,
    }
    if (log.type === 'begin') {
      return {
        $type: 'chat.bsky.convo.defs#logBeginConvo',
        ...base,
      } as $Typed<ChatBskyConvoDefs.LogBeginConvo>
    }
    if (log.type === 'accept') {
      return {
        $type: 'chat.bsky.convo.defs#logAcceptConvo',
        ...base,
      } as $Typed<ChatBskyConvoDefs.LogAcceptConvo>
    }
    if (log.type === 'leave') {
      return {
        $type: 'chat.bsky.convo.defs#logLeaveConvo',
        ...base,
      } as $Typed<ChatBskyConvoDefs.LogLeaveConvo>
    }
    if (log.type === 'mute') {
      return {
        $type: 'chat.bsky.convo.defs#logMuteConvo',
        ...base,
      } as $Typed<ChatBskyConvoDefs.LogMuteConvo>
    }
    if (log.type === 'unmute') {
      return {
        $type: 'chat.bsky.convo.defs#logUnmuteConvo',
        ...base,
      } as $Typed<ChatBskyConvoDefs.LogUnmuteConvo>
    }

    const convo = this.requireConvo(log.convoId)
    const message = this.requireMessage(convo, log.messageId)
    const visibleMessage = this.toVisibleMessage(message, convo, viewerDid)

    if (log.type === 'create-message') {
      return {
        $type: 'chat.bsky.convo.defs#logCreateMessage',
        ...base,
        message:
          visibleMessage as ChatBskyConvoDefs.LogCreateMessage['message'],
      } as $Typed<ChatBskyConvoDefs.LogCreateMessage>
    }
    if (log.type === 'delete-message') {
      return {
        $type: 'chat.bsky.convo.defs#logDeleteMessage',
        ...base,
        message:
          visibleMessage as ChatBskyConvoDefs.LogDeleteMessage['message'],
      } as $Typed<ChatBskyConvoDefs.LogDeleteMessage>
    }
    if (log.type === 'read-message') {
      return {
        $type: 'chat.bsky.convo.defs#logReadMessage',
        ...base,
        message: visibleMessage as ChatBskyConvoDefs.LogReadMessage['message'],
      } as $Typed<ChatBskyConvoDefs.LogReadMessage>
    }

    const reaction = this.toReactionView({
      value: log.value,
      senderDid: log.senderDid,
      createdAt:
        message.reactions.find(
          (item) =>
            item.value === log.value && item.senderDid === log.senderDid,
        )?.createdAt ?? message.sentAt,
    })

    if (log.type === 'add-reaction') {
      return {
        $type: 'chat.bsky.convo.defs#logAddReaction',
        ...base,
        message: visibleMessage as ChatBskyConvoDefs.LogAddReaction['message'],
        reaction: reaction as ChatBskyConvoDefs.LogAddReaction['reaction'],
      } as $Typed<ChatBskyConvoDefs.LogAddReaction>
    }
    return {
      $type: 'chat.bsky.convo.defs#logRemoveReaction',
      ...base,
      message: visibleMessage as ChatBskyConvoDefs.LogRemoveReaction['message'],
      reaction: reaction as ChatBskyConvoDefs.LogRemoveReaction['reaction'],
    } as $Typed<ChatBskyConvoDefs.LogRemoveReaction>
  }

  private async toConvoView(
    convo: InternalConvo,
    viewerDid: string,
  ): Promise<$Typed<ChatBskyConvoDefs.ConvoView>> {
    const memberState = this.getMemberState(convo, viewerDid)
    const members = await this.toConvoMembers(convo)
    const lastVisibleMessage = convo.messages.length
      ? this.toVisibleMessage(
          convo.messages[convo.messages.length - 1]!,
          convo,
          viewerDid,
        )
      : undefined
    const lastReaction = this.getLastReaction(convo, viewerDid)
    return {
      $type: 'chat.bsky.convo.defs#convoView',
      id: convo.id,
      rev: convo.rev,
      members,
      lastMessage:
        lastVisibleMessage as ChatBskyConvoDefs.ConvoView['lastMessage'],
      lastReaction: lastReaction as ChatBskyConvoDefs.ConvoView['lastReaction'],
      muted: memberState.muted,
      status: memberState.status,
      unreadCount: this.getUnreadCount(convo, viewerDid),
      kind:
        convo.kind === 'group'
          ? {
              $type: 'chat.bsky.convo.defs#groupConvo',
              name: convo.name ?? 'Group chat',
              memberCount: convo.memberDids.length,
              lockStatus: convo.locked ? 'locked' : 'unlocked',
            }
          : {
              $type: 'chat.bsky.convo.defs#directConvo',
            },
    } as $Typed<ChatBskyConvoDefs.ConvoView>
  }

  private async toConvoMembers(
    convo: InternalConvo,
  ): Promise<ChatBskyActorDefs.ProfileViewBasic[]> {
    const profiles = await Promise.all(
      convo.memberDids.map((did) => this.getProfile(did)),
    )
    return profiles.map((profile) => ({
      ...profile,
      kind:
        convo.kind === 'group'
          ? {
              $type: 'chat.bsky.actor.defs#groupConvoMember',
              role: profile.did === convo.ownerDid ? 'owner' : 'standard',
            }
          : {
              $type: 'chat.bsky.actor.defs#directConvoMember',
            },
    }))
  }

  private getLastReaction(
    convo: InternalConvo,
    viewerDid: string,
  ): $Typed<ChatBskyConvoDefs.MessageAndReactionView> | undefined {
    const deleted = this.getMemberState(convo, viewerDid).deletedMessageIds
    for (let index = convo.messages.length - 1; index >= 0; index -= 1) {
      const message = convo.messages[index]
      if (!message || deleted.has(message.id)) continue
      const reaction = message.reactions[message.reactions.length - 1]
      if (!reaction) continue
      return {
        $type: 'chat.bsky.convo.defs#messageAndReactionView',
        message: this.toMessageView(message),
        reaction: this.toReactionView(reaction),
      } as $Typed<ChatBskyConvoDefs.MessageAndReactionView>
    }
    return undefined
  }

  private toVisibleMessage(
    message: InternalMessage,
    convo: InternalConvo,
    viewerDid: string,
  ):
    | $Typed<ChatBskyConvoDefs.MessageView>
    | $Typed<ChatBskyConvoDefs.DeletedMessageView> {
    const deleted = this.getMemberState(convo, viewerDid).deletedMessageIds
    if (deleted.has(message.id)) {
      return this.toDeletedMessageView(message)
    }
    return this.toMessageView(message)
  }

  private toMessageView(
    message: InternalMessage,
  ): $Typed<ChatBskyConvoDefs.MessageView> {
    return {
      $type: 'chat.bsky.convo.defs#messageView',
      id: message.id,
      rev: message.rev,
      text: message.text,
      facets: message.facets,
      embed: message.embed as ChatBskyConvoDefs.MessageView['embed'],
      reactions: message.reactions.length
        ? message.reactions.map((reaction) => this.toReactionView(reaction))
        : undefined,
      sender: {
        $type: 'chat.bsky.convo.defs#messageViewSender',
        did: message.senderDid,
      },
      sentAt: message.sentAt,
    } as $Typed<ChatBskyConvoDefs.MessageView>
  }

  private toDeletedMessageView(
    message: InternalMessage,
    rev = message.rev,
  ): $Typed<ChatBskyConvoDefs.DeletedMessageView> {
    return {
      $type: 'chat.bsky.convo.defs#deletedMessageView',
      id: message.id,
      rev,
      sender: {
        $type: 'chat.bsky.convo.defs#messageViewSender',
        did: message.senderDid,
      },
      sentAt: message.sentAt,
    } as $Typed<ChatBskyConvoDefs.DeletedMessageView>
  }

  private toReactionView(
    reaction: InternalReaction,
  ): $Typed<ChatBskyConvoDefs.ReactionView> {
    return {
      $type: 'chat.bsky.convo.defs#reactionView',
      value: reaction.value,
      sender: {
        $type: 'chat.bsky.convo.defs#reactionViewSender',
        did: reaction.senderDid,
      },
      createdAt: reaction.createdAt,
    } as $Typed<ChatBskyConvoDefs.ReactionView>
  }

  private async getProfile(
    did: string,
  ): Promise<ChatBskyActorDefs.ProfileViewBasic> {
    const cached = this.profileCache.get(did)
    if (cached) return cached
    try {
      const atprotoData = await this.idResolver.did.resolveAtprotoData(did)
      const profile: ChatBskyActorDefs.ProfileViewBasic = {
        $type: 'chat.bsky.actor.defs#profileViewBasic',
        did,
        handle: atprotoData.handle,
        displayName: deriveDisplayName(atprotoData.handle),
      }
      this.profileCache.set(did, profile)
      return profile
    } catch {
      const fallback: ChatBskyActorDefs.ProfileViewBasic = {
        $type: 'chat.bsky.actor.defs#profileViewBasic',
        did,
        handle: did,
        displayName: did,
      }
      this.profileCache.set(did, fallback)
      return fallback
    }
  }

  private bumpConvoRev(convo: InternalConvo): string {
    const rev = this.nextRev()
    convo.rev = rev
    return rev
  }

  private nextRev(): string {
    this.revSeq += 1
    return this.revSeq.toString().padStart(12, '0')
  }
}

const createChatDid = async (plcUrl: string, port: number): Promise<string> => {
  const keypair = await Secp256k1Keypair.create()
  const plcClient = new plc.Client(plcUrl)
  const op = await plc.signOperation(
    {
      type: 'plc_operation',
      verificationMethods: {
        atproto: keypair.did(),
      },
      rotationKeys: [keypair.did()],
      alsoKnownAs: [],
      services: {
        bsky_chat: {
          type: 'BskyChatService',
          endpoint: `http://localhost:${port}`,
        },
      },
      prev: null,
    },
    keypair,
  )
  const did = await plc.didForCreateOp(op)
  await plcClient.sendOperation(did, op)
  return did
}

const convoKey = (memberDids: string[]): string =>
  [...memberDids].sort().join('|')

const normalizeMemberList = (
  value: string[] | string | undefined,
  requesterDid: string,
): string[] => {
  const members = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : []
  return [...new Set([...members, requesterDid])].sort()
}

const normalizeStatus = (value: unknown): ConvoStatus | undefined => {
  return value === 'request' || value === 'accepted' ? value : undefined
}

const normalizeReadState = (value: unknown): 'unread' | undefined => {
  return value === 'unread' ? value : undefined
}

const decodeCursor = (cursor?: string): number => {
  if (!cursor) return 0
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const encodeCursor = (offset: number): string => String(offset)

const clampLimit = (limit: number | undefined, max: number): number => {
  if (!limit || !Number.isFinite(limit) || limit < 1) return 50
  return Math.min(limit, max)
}

const deriveDisplayName = (handle: string): string => {
  const [first] = handle.split('.')
  return first || handle
}

const normalizeReactionValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new InvalidRequestError(
      'reaction value must be a string',
      'ReactionInvalidValue',
    )
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new InvalidRequestError(
      'reaction value must not be empty',
      'ReactionInvalidValue',
    )
  }
  if (trimmed.length > 32) {
    throw new InvalidRequestError(
      'reaction value is too long',
      'ReactionInvalidValue',
    )
  }
  return trimmed
}

const getPlcUrl = (config: TestChatConfig): string | undefined => {
  if (config.plcUrl) return config.plcUrl
  const maybePds = config.pds as
    | {
        ctx?: {
          cfg?: {
            didPlcUrl?: string
            identity?: {
              plcUrl?: string
            }
          }
        }
      }
    | undefined
  return maybePds?.ctx?.cfg?.didPlcUrl || maybePds?.ctx?.cfg?.identity?.plcUrl
}
