import { readFile } from 'node:fs/promises'
import type { AtpAgent } from '@atproto/api'
import { currentDatetimeString } from '@atproto/lex'
import { seedTid } from './seed-tid.js'

const fixtures = [
  ['key-portrait-large.jpg', 'Yo buscando la clave del debate'],
  ['key-landscape-large.jpg', 'Cuando por fin encontramos un punto en común'],
  ['at.png', 'El grupo organizándose para cambiar el mundo'],
  ['key-alt.jpg', 'La solución estaba aquí todo el tiempo'],
  ['key-landscape-small.jpg', 'Una reunión que pudo ser un meme'],
  ['key-portrait-small.jpg', 'Mi cara cuando dicen: solo cinco minutos más'],
  ['at.png', 'Cuando toda la comunidad está de acuerdo'],
  ['key-landscape-large.jpg', 'Se abre el debate. Se cierra mi concentración.'],
] as const

/** Upload local image fixtures and upsert eight real PARA meme records. */
export async function seedDemoMemes(agent: AtpAgent): Promise<void> {
  if (!agent.session) throw new Error('Log in before seeding memes')
  const repo = agent.session.did
  const createdAt = currentDatetimeString()

  for (const [index, [filename, text]] of fixtures.entries()) {
    const bytes = await readFile(
      new URL(`../../assets/${filename}`, import.meta.url),
    )
    const {
      data: { blob },
    } = await agent.uploadBlob(bytes, {
      encoding: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
    })
    const rkey = seedTid(`meme-ui:${index}`)
    const { data: post } = await agent.com.atproto.repo.putRecord({
      repo,
      collection: 'com.para.post',
      rkey,
      record: {
        $type: 'com.para.post',
        text,
        createdAt,
        postType: 'meme',
        tags: ['meme', 'demo'],
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            { image: blob, alt: `Imagen de prueba ${index + 1}: ${text}` },
          ],
        },
      },
    })
    await agent.com.atproto.repo.putRecord({
      repo,
      collection: 'com.para.social.postMeta',
      rkey,
      record: {
        $type: 'com.para.social.postMeta',
        post: post.uri,
        postType: 'meme',
        category: 'humor',
        tags: ['meme', 'demo'],
        voteScore: 0,
        createdAt,
      },
    })
  }
  console.log(`Seeded ${fixtures.length} image memes for ${repo}`)
}
