import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'

function getConversationKey(userDid: string, agentId: string): string {
  return `agentchat:${userDid}:${agentId}`
}

interface ChatMessage {
  id: string
  text: string
  sender: 'user' | 'agent'
  createdAt: string
}

export default function (server: Server, ctx: AppContext) {
  server.com.para.agent.getConversation({
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth }) => {
      const actorDid = auth.credentials.iss
      const { agentId } = params

      if (!ctx.redis) {
        return {
          encoding: 'application/json' as const,
          body: {
            messages: [],
          },
        }
      }

      const key = getConversationKey(actorDid, agentId)
      const historyRaw = await ctx.redis.driver.lrange(key, 0, -1)
      const messages: ChatMessage[] = historyRaw.map((raw) => JSON.parse(raw))

      return {
        encoding: 'application/json' as const,
        body: {
          messages: messages.map((msg) => ({
            id: msg.id,
            text: msg.text,
            sender: msg.sender,
            createdAt: msg.createdAt,
          })),
        },
      }
    },
  })
}
