import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { OpenAIMessage } from '../../../../openai.js'

const AGENT_PROMPTS: Record<string, string> = {
  'Xavier Exul':
    'Eres Xavier Exul, un asesor de participación cívica. Ayudas a las comunidades a entender la gobernanza, las políticas públicas y la participación democrática. Responde en español salvo que se te pida lo contrario. Sé claro, conciso y orientado a la acción.',
  Antigravity:
    'Eres Antigravity, un analista político centrista. Buscas el equilibrio entre posturas ideológicas y priorizas los hechos verificables por encima de la retórica partidista. Responde en español salvo que se te pida lo contrario. Sé objetivo, cita datos cuando sea posible, y evita sesgos de confirmación. Tu objetivo es ayudar al usuario a entender la realidad política tal cual es, no como la desean los extremos.',
  Compañero:
    'Eres Compañero, un organizador comunitario amigable. Ayudas a las personas a encontrar puntos en común y construir consenso. Responde en español salvo que se te pida lo contrario. Sé empático, paciente y orientado a la colaboración.',
}

const DEFAULT_PROMPT =
  'Eres un asistente de comunidad cívica. Responde en español salvo que se te pida lo contrario. Sé útil, claro y conciso.'

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
  server.com.para.agent.sendMessage({
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { agentId, text } = input.body

      if (!ctx.openaiClient) {
        return {
          status: 503,
          message: 'Agent chat service is not configured',
        }
      }

      if (!ctx.redis) {
        return {
          status: 503,
          message: 'Redis is not available',
        }
      }

      const key = getConversationKey(actorDid, agentId)

      // Store user message
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}_user`,
        text,
        sender: 'user',
        createdAt: new Date().toISOString(),
      }
      await ctx.redis.driver.rpush(key, JSON.stringify(userMessage))
      await ctx.redis.driver.expire(key, 30 * 24 * 60 * 60) // 30 days

      // Build conversation history for OpenAI
      const historyRaw = await ctx.redis.driver.lrange(key, 0, -1)
      const history: ChatMessage[] = historyRaw.map((raw) => JSON.parse(raw))

      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: AGENT_PROMPTS[agentId] || DEFAULT_PROMPT,
        },
        ...history.map(
          (msg): OpenAIMessage => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text,
          }),
        ),
      ]

      // Call OpenAI
      let responseText: string
      try {
        responseText = await ctx.openaiClient.chatCompletion(messages)
      } catch (err: any) {
        return {
          status: 502,
          message: `Agent response failed: ${err.message}`,
        }
      }

      // Store agent response
      const agentMessage: ChatMessage = {
        id: `msg_${Date.now()}_agent`,
        text: responseText,
        sender: 'agent',
        createdAt: new Date().toISOString(),
      }
      await ctx.redis.driver.rpush(key, JSON.stringify(agentMessage))
      await ctx.redis.driver.expire(key, 30 * 24 * 60 * 60)

      return {
        encoding: 'application/json' as const,
        body: {
          message: {
            id: agentMessage.id,
            text: agentMessage.text,
            sender: agentMessage.sender,
            createdAt: agentMessage.createdAt,
          },
        },
      }
    },
  })
}
