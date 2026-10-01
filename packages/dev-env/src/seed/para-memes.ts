import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AtpAgent } from '@atproto/api'
import { currentDatetimeString } from '@atproto/lex'
import { seedTid } from './seed-tid.js'

const captions = [
  'Yo buscando la clave del debate',
  'Cuando por fin encontramos un punto en común',
  'El grupo organizándose para cambiar el mundo',
  'La solución estaba aquí todo el tiempo',
  'Una reunión que pudo ser un meme',
  'Mi cara cuando dicen: solo cinco minutos más',
  'Cuando toda la comunidad está de acuerdo',
  'Se abre el debate. Se cierra mi concentración.',
] as const
const fixtureNames = [
  '00-portrait.jpg',
  '01-landscape.jpg',
  '02-at.png',
  '03-alt.jpg',
  '04-landscape-small.jpg',
  '05-portrait-small.jpg',
  '06-hd.jpg',
  '07-landscape-again.jpg',
] as const
const memeDirectory = fileURLToPath(
  new URL('../../assets/memes/', import.meta.url),
)
const imageTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** Upload local image fixtures and upsert real PARA meme records. */
export async function seedDemoMemes(agent: AtpAgent): Promise<void> {
  if (!agent.session) throw new Error('Log in before seeding memes')
  const repo = agent.session.did
  const createdAt = currentDatetimeString()
  const files = (await readdir(memeDirectory, { withFileTypes: true }))
    .filter(
      (file) =>
        file.isFile() && imageTypes[path.extname(file.name).toLowerCase()],
    )
    .map((file) => file.name)
    .sort()

  for (const [index, filename] of files.entries()) {
    const file = path.join(memeDirectory, filename)
    if ((await stat(file)).size > 10_000_000) {
      throw new Error(`Meme image exceeds 10 MB: ${filename}`)
    }
    const bytes = await readFile(file)
    const fixtureIndex = fixtureNames.findIndex((name) => name === filename)
    const defaultIndex = fixtureIndex === -1 ? undefined : fixtureIndex
    const text =
      defaultIndex !== undefined
        ? captions[defaultIndex]
        : path
            .basename(filename, path.extname(filename))
            .replaceAll(/[-_]+/g, ' ')
    const {
      data: { blob },
    } = await agent.uploadBlob(bytes, {
      encoding: imageTypes[path.extname(filename).toLowerCase()],
    })
    const rkey = seedTid(
      defaultIndex !== undefined
        ? `meme-ui:${defaultIndex}`
        : `meme-ui:${filename}`,
    )
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
  console.log(`Seeded ${files.length} image memes for ${repo}`)
}
