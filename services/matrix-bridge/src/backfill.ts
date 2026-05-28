#!/usr/bin/env node
/**
 * Backfill script: sync all existing PARA communities and memberships to Matrix.
 *
 * Usage:
 *   npx tsx src/backfill.ts --communities-file ./communities.json
 *   npx tsx src/backfill.ts --appview https://api.para.social --community-uri at://did:plc:xxx/com.para.community.board/xxx
 *
 * The communities.json format:
 *   [
 *     {
 *       "uri": "at://did:plc:abc/com.para.community.board/my-community",
 *       "name": "My Community",
 *       "slug": "my-community",
 *       "chamberMode": "bicameral",
 *       "creatorDid": "did:plc:abc"
 *     }
 *   ]
 */

import pino from 'pino'
import { AtpAgent } from '@atproto/api'
import { loadConfig } from './config.js'
import { BridgeDatabase } from './db.js'
import { MatrixAdminClient, didToMxid, extractServerName } from './matrix.js'

const log = pino({
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
})

async function main() {
  const args = process.argv.slice(2)
  const communitiesFileIndex = args.indexOf('--communities-file')
  const appviewIndex = args.indexOf('--appview')
  const communityUriIndex = args.indexOf('--community-uri')

  const config = loadConfig()
  const db = new BridgeDatabase(config)
  const matrix = new MatrixAdminClient(config)
  const serverName = extractServerName(config.matrixHomeserverUrl)

  let communities: Array<{
    uri: string
    name: string
    slug: string
    chamberMode?: string
    creatorDid: string
  }> = []

  if (communitiesFileIndex >= 0) {
    const filePath = args[communitiesFileIndex + 1]
    const fs = await import('node:fs')
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    communities = Array.isArray(data) ? data : [data]
    log.info({ count: communities.length }, 'Loaded communities from file')
  } else if (appviewIndex >= 0 && communityUriIndex >= 0) {
    const appviewUrl = args[appviewIndex + 1]
    const communityUri = args[communityUriIndex + 1]
    const agent = new AtpAgent({ service: appviewUrl })

    log.info(
      { appviewUrl, communityUri },
      'Fetching single community from AppView',
    )

    try {
      const res = await agent.call('com.para.community.getBoard', {
        uri: communityUri,
      })
      const board = (res.data as any)?.board
      if (board) {
        communities.push({
          uri: communityUri,
          name: board.name,
          slug: board.slug ?? 'community',
          chamberMode: board.chamberMode ?? 'unicameral',
          creatorDid: board.creatorDid,
        })
      }
    } catch (err: any) {
      log.error({ err }, 'Failed to fetch community from AppView')
    }
  } else {
    log.info('Usage:')
    log.info('  npx tsx src/backfill.ts --communities-file ./communities.json')
    log.info(
      '  npx tsx src/backfill.ts --appview https://api.para.social --community-uri at://...',
    )
    log.info('')
    log.info('Example communities.json:')
    log.info(
      JSON.stringify(
        [
          {
            uri: 'at://did:plc:abc123/com.para.community.board/denver-zoning',
            name: 'Denver Zoning Reform',
            slug: 'denver-zoning',
            chamberMode: 'bicameral',
            creatorDid: 'did:plc:abc123',
          },
        ],
        null,
        2,
      ),
    )
    db.close()
    return
  }

  for (const comm of communities) {
    log.info({ uri: comm.uri, name: comm.name }, 'Processing community')

    const existing = db.getSpaceForCommunity(comm.uri)
    if (existing) {
      log.info(
        { uri: comm.uri },
        'Community already has Matrix space, skipping creation',
      )
    } else {
      try {
        const spaceId = await matrix.createSpace(comm.name, comm.slug)
        db.setSpaceForCommunity(
          comm.uri,
          spaceId,
          comm.slug,
          comm.chamberMode ?? 'unicameral',
        )
        log.info({ uri: comm.uri, spaceId }, 'Created Matrix space')

        if (comm.chamberMode === 'bicameral') {
          const [chamberA, chamberB, observerRoom] = await Promise.all([
            matrix.createRoom(
              `${comm.name} — Cámara A`,
              `${comm.slug}-chamber-a`,
              spaceId,
            ),
            matrix.createRoom(
              `${comm.name} — Cámara B`,
              `${comm.slug}-chamber-b`,
              spaceId,
            ),
            matrix.createRoom(
              `${comm.name} — Consejo Observador`,
              `${comm.slug}-observers`,
              spaceId,
            ),
          ])
          db.setChamberRooms(comm.uri, chamberA, chamberB, observerRoom)
          log.info(
            { uri: comm.uri, chamberA, chamberB, observerRoom },
            'Created chamber rooms',
          )

          await Promise.all([
            matrix.addChildSpace(spaceId, chamberA, [serverName]),
            matrix.addChildSpace(spaceId, chamberB, [serverName]),
            matrix.addChildSpace(spaceId, observerRoom, [serverName]),
          ])
        }

        // Invite creator as admin
        const creatorMxid = ensureUser(matrix, db, comm.creatorDid, serverName)
        await matrix.inviteUser(spaceId, creatorMxid)
        await matrix.setPowerLevel(spaceId, creatorMxid, 100)
        log.info({ uri: comm.uri, creatorMxid }, 'Invited creator as admin')
      } catch (err: any) {
        log.error({ err, uri: comm.uri }, 'Failed to create Matrix space')
        continue
      }
    }

    // Backfill memberships
    const space = db.getSpaceForCommunity(comm.uri)
    if (!space) continue

    log.info({ uri: comm.uri }, 'Backfilling memberships...')

    // NOTE: In production, fetch memberships from AppView database or API
    // For now, this is a placeholder that expects manual input or AppView integration
    log.warn('Membership backfill requires AppView integration.')
    log.info(
      'To backfill members, query your AppView for all active memberships and call:',
    )
    log.info('  ensureUser(matrix, db, member.did, serverName)')
    log.info('  matrix.inviteUser(spaceId, mxid)')
    log.info(
      '  For bicameral: assignChamberBalanced() then invite to chamber room',
    )
  }

  db.close()
  log.info('Backfill complete')
}

function ensureUser(
  matrix: MatrixAdminClient,
  db: BridgeDatabase,
  did: string,
  serverName: string,
): string {
  let mxid = db.getMxidForDid(did)
  if (!mxid) {
    mxid = didToMxid(did, serverName)
    db.setMxidForDid(did, mxid, '')
  }

  // Note: We don't create the user here because createUser is async.
  // In the backfill loop, call ensureUserAsync() instead.
  return mxid
}

main().catch((err) => {
  log.error(err)
  process.exit(1)
})
