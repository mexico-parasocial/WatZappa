import { RecordRef, SeedClient } from './client.js'
import { ParaSeedCheckpointRunner } from './para-checkpoints.js'

export default async (sc: SeedClient) => {
  const checkpoints = new ParaSeedCheckpointRunner(sc.network)
  const createdAt = () => new Date().toISOString()
  const login = async (identifier: string, password: string) => {
    const agent = sc.network.pds.getAgent()
    await agent.login({ identifier, password })
    return agent
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  USERS  (20 total — 3 from minimal setup + 17 new)
  // ═══════════════════════════════════════════════════════════════════════

  const alice = await login('alice.test', 'hunter2')
  const bob = await login('bob.test', 'hunter2')
  const carla = await login('carla.test', 'hunter2')

  const newUsers = [
    {
      short: 'dan',
      email: 'dan@test.com',
      handle: 'dan.test',
      password: 'hunter2',
      displayName: 'Dan Martínez',
      description:
        'Activista ambiental. Yucatán 🌿 | Presupuesto participativo | Ciclista urbano',
    },
    {
      short: 'eva',
      email: 'eva@test.com',
      handle: 'eva.test',
      password: 'hunter2',
      displayName: 'Eva Hernández',
      description:
        'Líder sindical. Puebla ✊ | Derechos laborales | Vivienda digna para todxs',
    },
    {
      short: 'fernando',
      email: 'fernando@test.com',
      handle: 'fernando.test',
      password: 'hunter2',
      displayName: 'Fernando Ruiz',
      description:
        'Emprendedor social. Querétaro 🚀 | Economía circular | Transparencia fiscal',
    },
    {
      short: 'gabriela',
      email: 'gabriela@test.com',
      handle: 'gabriela.test',
      password: 'hunter2',
      displayName: 'Gaby Torres',
      description:
        'Periodista independiente. CDMX 📰 | Datos abiertos | Seguimiento legislativo',
    },
    {
      short: 'hector',
      email: 'hector@test.com',
      handle: 'hector.test',
      password: 'hunter2',
      displayName: 'Hector Camacho',
      description:
        'Profesor ITAM. CDMX 📚 | Economía del comportamiento | Políticas públicas',
    },
    {
      short: 'isabel',
      email: 'isabel@test.com',
      handle: 'isabel.test',
      password: 'hunter2',
      displayName: 'Isa Cruz',
      description:
        'Activista feminista. Oaxaca 💜 | DDHH | Justicia territorial',
    },
    {
      short: 'jorge',
      email: 'jorge@test.com',
      handle: 'jorge.test',
      password: 'hunter2',
      displayName: 'Jorge Silva',
      description:
        'Empresario tech. Monterrey, NL 💻 | Movilidad inteligente | Smart cities',
    },
    {
      short: 'karla',
      email: 'karla@test.com',
      handle: 'karla.test',
      password: 'hunter2',
      displayName: 'Karla Jiménez',
      description:
        'Maestra rural. Chiapas 🍎 | Educación indígena | Bibliotecas comunitarias',
    },
    {
      short: 'luis',
      email: 'luis@test.com',
      handle: 'luis.test',
      password: 'hunter2',
      displayName: 'Luis Morales',
      description:
        'Médico comunitario. Guerrero 🏥 | Salud preventiva | Agua potable',
    },
    {
      short: 'mariana',
      email: 'mariana@test.com',
      handle: 'mariana.test',
      password: 'hunter2',
      displayName: 'Mariana Vásquez',
      description: 'Abogada DDHH. CDMX ⚖️ | Transparencia | Anticorrupción',
    },
    {
      short: 'nicolas',
      email: 'nicolas@test.com',
      handle: 'nicolas.test',
      password: 'hunter2',
      displayName: 'Nico Reyes',
      description:
        'Ingeniero civil. Guadalajara 🏗️ | Infraestructura verde | Movilidad sostenible',
    },
    {
      short: 'olivia',
      email: 'olivia@test.com',
      handle: 'olivia.test',
      password: 'hunter2',
      displayName: 'Olivia Paredes',
      description:
        'Artista urbana. CDMX 🎨 | Cultura digital | Espacios públicos creativos',
    },
    {
      short: 'pablo',
      email: 'pablo@test.com',
      handle: 'pablo.test',
      password: 'hunter2',
      displayName: 'Pablo Soto',
      description:
        'Estudiante BUAP. Puebla 📖 | Juventud política | Primer voto informado',
    },
    {
      short: 'quetzali',
      email: 'quetzali@test.com',
      handle: 'quetzali.test',
      password: 'hunter2',
      displayName: 'Quetzali López',
      description:
        'Comunidad zapoteca. Oaxaca 🌽 | Soberanía alimentaria | Derechos indígenas',
    },
    {
      short: 'rodrigo',
      email: 'rodrigo@test.com',
      handle: 'rodrigo.test',
      password: 'hunter2',
      displayName: 'Rodrigo Domínguez',
      description:
        'Taxista organizado. CDMX 🚕 | Movilidad justa | Seguridad vial',
    },
    {
      short: 'sofia',
      email: 'sofia@test.com',
      handle: 'sofia.test',
      password: 'hunter2',
      displayName: 'Sofía Castillo',
      description:
        'Chef restaurantera. CDMX 🍽️ | Soberanía alimentaria | Mercados locales',
    },
    {
      short: 'tomas',
      email: 'tomas@test.com',
      handle: 'tomas.test',
      password: 'hunter2',
      displayName: 'Tomás Aguilar',
      description:
        'Jubilado IMSS. Mérida, Yuc 🏛️ | Pensiones dignas | Adultos mayores activos',
    },
  ]

  for (const u of newUsers) {
    if (!sc.dids[u.short]) {
      await sc.createAccount(u.short, {
        email: u.email,
        handle: u.handle,
        password: u.password,
      })
    }
  }

  await checkpoints.flush('users')

  // Login all new users
  const userAgents: Record<string, any> = {}
  for (const u of newUsers) {
    userAgents[u.short] = await login(u.handle, u.password)
  }

  // Build user array with metadata
  const users = [
    {
      short: 'alice',
      agent: alice,
      did: alice.assertDid,
      name: 'Alice',
      region: 'CDMX',
      party: 'Morena',
      role: 'Diputada federal',
    },
    {
      short: 'bob',
      agent: bob,
      did: bob.assertDid,
      name: 'Bob',
      region: 'Jalisco',
      party: 'PAN',
      role: 'Senador',
    },
    {
      short: 'carla',
      agent: carla,
      did: carla.assertDid,
      name: 'Carla',
      region: 'Nuevo León',
      party: 'PRI',
      role: 'Regidora',
    },
    {
      short: 'dan',
      agent: userAgents.dan,
      did: userAgents.dan.assertDid,
      name: 'Dan',
      region: 'Yucatán',
      party: 'PVEM',
      role: 'Activista ambiental',
    },
    {
      short: 'eva',
      agent: userAgents.eva,
      did: userAgents.eva.assertDid,
      name: 'Eva',
      region: 'Puebla',
      party: 'PT',
      role: 'Líder sindical',
    },
    {
      short: 'fernando',
      agent: userAgents.fernando,
      did: userAgents.fernando.assertDid,
      name: 'Fernando',
      region: 'Querétaro',
      party: 'MC',
      role: 'Emprendedor social',
    },
    {
      short: 'gabriela',
      agent: userAgents.gabriela,
      did: userAgents.gabriela.assertDid,
      name: 'Gabriela',
      region: 'CDMX',
      party: 'Independiente',
      role: 'Periodista',
    },
    {
      short: 'hector',
      agent: userAgents.hector,
      did: userAgents.hector.assertDid,
      name: 'Hector',
      region: 'CDMX',
      party: 'Independiente',
      role: 'Académico',
    },
    {
      short: 'isabel',
      agent: userAgents.isabel,
      did: userAgents.isabel.assertDid,
      name: 'Isabel',
      region: 'Oaxaca',
      party: 'Independiente',
      role: 'Activista feminista',
    },
    {
      short: 'jorge',
      agent: userAgents.jorge,
      did: userAgents.jorge.assertDid,
      name: 'Jorge',
      region: 'Nuevo León',
      party: 'MC',
      role: 'Empresario tech',
    },
    {
      short: 'karla',
      agent: userAgents.karla,
      did: userAgents.karla.assertDid,
      name: 'Karla',
      region: 'Chiapas',
      party: 'Morena',
      role: 'Maestra rural',
    },
    {
      short: 'luis',
      agent: userAgents.luis,
      did: userAgents.luis.assertDid,
      name: 'Luis',
      region: 'Guerrero',
      party: 'PT',
      role: 'Médico comunitario',
    },
    {
      short: 'mariana',
      agent: userAgents.mariana,
      did: userAgents.mariana.assertDid,
      name: 'Mariana',
      region: 'CDMX',
      party: 'Independiente',
      role: 'Abogada DDHH',
    },
    {
      short: 'nicolas',
      agent: userAgents.nicolas,
      did: userAgents.nicolas.assertDid,
      name: 'Nicolas',
      region: 'Jalisco',
      party: 'PAN',
      role: 'Ingeniero civil',
    },
    {
      short: 'olivia',
      agent: userAgents.olivia,
      did: userAgents.olivia.assertDid,
      name: 'Olivia',
      region: 'CDMX',
      party: 'Independiente',
      role: 'Artista urbana',
    },
    {
      short: 'pablo',
      agent: userAgents.pablo,
      did: userAgents.pablo.assertDid,
      name: 'Pablo',
      region: 'Puebla',
      party: 'Morena',
      role: 'Estudiante',
    },
    {
      short: 'quetzali',
      agent: userAgents.quetzali,
      did: userAgents.quetzali.assertDid,
      name: 'Quetzali',
      region: 'Oaxaca',
      party: 'Independiente',
      role: 'Comunidad zapoteca',
    },
    {
      short: 'rodrigo',
      agent: userAgents.rodrigo,
      did: userAgents.rodrigo.assertDid,
      name: 'Rodrigo',
      region: 'CDMX',
      party: 'PT',
      role: 'Taxista organizado',
    },
    {
      short: 'sofia',
      agent: userAgents.sofia,
      did: userAgents.sofia.assertDid,
      name: 'Sofia',
      region: 'CDMX',
      party: 'Independiente',
      role: 'Chef restaurantera',
    },
    {
      short: 'tomas',
      agent: userAgents.tomas,
      did: userAgents.tomas.assertDid,
      name: 'Tomas',
      region: 'Yucatán',
      party: 'Morena',
      role: 'Jubilado IMSS',
    },
  ]

  // ═══════════════════════════════════════════════════════════════════════
  //  PROFILES  (update existing + create new)
  // ═══════════════════════════════════════════════════════════════════════

  // Update existing profiles
  for (const u of users.slice(0, 3)) {
    await u.agent.app.bsky.actor.profile.put(
      { repo: u.did, rkey: 'self' },
      {
        displayName: u.name,
        description:
          newUsers.find((n) => n.short === u.short)?.description || '',
        createdAt: createdAt(),
      },
    )
  }

  await checkpoints.flush('profiles')

  // ═══════════════════════════════════════════════════════════════════════
  //  SOCIAL GRAPH  (realistic follows — clustered, not complete)
  // ═══════════════════════════════════════════════════════════════════════

  const follow = async (from: any, to: any) => {
    try {
      await from.agent.app.bsky.graph.follow.create(
        { repo: from.did },
        { subject: to.did, createdAt: createdAt() },
      )
    } catch (e) {
      // ignore duplicate follows
    }
  }

  // Party clusters: everyone follows their own party members
  const parties = ['Morena', 'PAN', 'PRI', 'PVEM', 'PT', 'MC', 'Independiente']
  for (const party of parties) {
    const members = users.filter((u) => u.party === party)
    for (const a of members) {
      for (const b of members) {
        if (a.did !== b.did) await follow(a, b)
      }
    }
  }

  // Cross-party follows: key politicians follow each other
  const crossFollows = [
    ['alice', 'bob'],
    ['alice', 'carla'],
    ['bob', 'carla'],
    ['alice', 'eva'],
    ['eva', 'karla'],
    ['eva', 'luis'],
    ['bob', 'nicolas'],
    ['carla', 'nicolas'],
    ['gabriela', 'alice'],
    ['gabriela', 'bob'],
    ['gabriela', 'carla'],
    ['gabriela', 'mariana'],
    ['gabriela', 'hector'],
    ['hector', 'alice'],
    ['hector', 'bob'],
    ['hector', 'carla'],
    ['mariana', 'gabriela'],
    ['mariana', 'hector'],
    ['jorge', 'bob'],
    ['jorge', 'nicolas'],
    ['fernando', 'carla'],
    ['fernando', 'jorge'],
    ['isabel', 'eva'],
    ['isabel', 'mariana'],
    ['olivia', 'isabel'],
    ['olivia', 'gabriela'],
    ['pablo', 'alice'],
    ['pablo', 'eva'],
    ['rodrigo', 'alice'],
    ['rodrigo', 'eva'],
    ['tomas', 'alice'],
    ['tomas', 'eva'],
    ['quetzali', 'isabel'],
    ['quetzali', 'karla'],
    ['sofia', 'olivia'],
    ['sofia', 'isabel'],
    ['luis', 'karla'],
    ['luis', 'tomas'],
    ['dan', 'fernando'],
    ['dan', 'jorge'],
  ]
  for (const [a, b] of crossFollows) {
    const from = users.find((u) => u.short === a)
    const to = users.find((u) => u.short === b)
    if (from && to) await follow(from, to)
  }

  await checkpoints.flush('graph')

  // ═══════════════════════════════════════════════════════════════════════
  //  VERIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════

  const verifiedUsers = [
    'alice',
    'bob',
    'carla',
    'gabriela',
    'hector',
    'mariana',
    'jorge',
    'fernando',
  ]
  for (const short of verifiedUsers) {
    const u = users.find((u) => u.short === short)
    if (u) {
      await u.agent.app.bsky.graph.verification.create(
        { repo: u.did },
        {
          subject: u.did,
          createdAt: createdAt(),
          handle: `${short}.test`,
          displayName: u.name,
        },
      )
    }
  }

  await checkpoints.flush('verifications')

  // ═══════════════════════════════════════════════════════════════════════
  //  PARTY BOARDS  (8 major parties + independientes)
  // ═══════════════════════════════════════════════════════════════════════

  const partyDefs = [
    {
      name: 'Morena',
      color: '#610200',
      creator: 'alice',
      official: 'alice',
      deputy: 'eva',
      deputy2: 'karla',
    },
    {
      name: 'PAN',
      color: '#004990',
      creator: 'bob',
      official: 'bob',
      deputy: 'nicolas',
      deputy2: 'carla',
    },
    {
      name: 'PRI',
      color: '#CE1126',
      creator: 'carla',
      official: 'carla',
      deputy: 'fernando',
      deputy2: 'jorge',
    },
    {
      name: 'PVEM',
      color: '#50B747',
      creator: 'dan',
      official: 'dan',
      deputy: 'fernando',
      deputy2: 'eva',
    },
    {
      name: 'PT',
      color: '#D92027',
      creator: 'eva',
      official: 'eva',
      deputy: 'luis',
      deputy2: 'rodrigo',
    },
    {
      name: 'MC',
      color: '#FF8300',
      creator: 'fernando',
      official: 'fernando',
      deputy: 'jorge',
      deputy2: 'nicolas',
    },
    {
      name: 'PRD',
      color: '#FFD700',
      creator: 'mariana',
      official: 'mariana',
      deputy: 'isabel',
      deputy2: 'olivia',
    },
    {
      name: 'Independientes',
      color: '#6B7280',
      creator: 'gabriela',
      official: 'gabriela',
      deputy: 'hector',
      deputy2: 'mariana',
    },
  ]

  const partyBoards: any[] = []
  for (const p of partyDefs) {
    const creator = users.find((u) => u.short === p.creator)!
    const board = await creator.agent.com.para.community.createBoard({
      name: p.name,
      quadrant: 'national',
      description: `Comunidad oficial del partido político ${p.name}. Espacio de deliberación, propuestas y coordinación ciudadana.`,
    })
    const uri = board.data.uri
    const rkey = uri.split('/').pop()!
    const slugBase = p.name
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const slug = `${slugBase}-${rkey}`
    partyBoards.push({
      ...p,
      uri,
      cid: board.data.cid,
      creatorDid: creator.did,
      slug,
      rkey,
    })
  }

  // Activate boards
  for (const pb of partyBoards) {
    const creator = users.find((u) => u.did === pb.creatorDid)!
    const current = await creator.agent.com.atproto.repo.getRecord({
      repo: pb.creatorDid,
      collection: 'com.para.community.board',
      rkey: pb.rkey,
    })
    await creator.agent.com.atproto.repo.putRecord({
      repo: pb.creatorDid,
      collection: 'com.para.community.board',
      rkey: pb.rkey,
      record: { ...(current.data.value as any), status: 'active' },
      swapRecord: current.data.cid,
    })
  }

  // Mass join
  for (const user of users) {
    for (const pb of partyBoards) {
      if (
        user.party === pb.name ||
        (pb.name === 'Independientes' && user.party === 'Independiente')
      ) {
        // auto-joined by being in party; skip explicit join
      } else {
        try {
          await user.agent.com.para.community.join({ communityUri: pb.uri })
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  // Governance with officials and deputies
  for (let i = 0; i < partyDefs.length; i++) {
    const p = partyDefs[i]
    const pb = partyBoards[i]
    const creator = users.find((u) => u.short === p.creator)!
    const deputy1 = users.find((u) => u.short === p.deputy)!
    const deputy2 = users.find((u) => u.short === p.deputy2)!
    const current = await creator.agent.com.atproto.repo.getRecord({
      repo: creator.did,
      collection: 'com.para.community.governance',
      rkey: pb.slug,
    })
    const currentGov = current.data.value as any
    await creator.agent.com.atproto.repo.putRecord({
      repo: creator.did,
      collection: 'com.para.community.governance',
      rkey: pb.slug,
      record: {
        ...currentGov,
        updatedAt: createdAt(),
        officials: [
          {
            did: creator.did,
            office: 'Representante Oficial',
            mandate: `Mandato como representante oficial de ${p.name}`,
          },
        ],
        deputies: [
          {
            key: `deputy-1-${p.name.toLowerCase()}`,
            tier: 'community',
            role: 'Diputado Digital',
            description: `Representante digital de ${p.name}`,
            capabilities: ['vote', 'propose', 'delegate'],
            activeHolder: {
              did: deputy1.did,
              handle: `${deputy1.short}.test`,
              displayName: deputy1.name,
            },
            votes: 1,
            applicants: [],
          },
          {
            key: `deputy-2-${p.name.toLowerCase()}`,
            tier: 'community',
            role: 'Vocal Ciudadano',
            description: `Voz ciudadana de ${p.name}`,
            capabilities: ['vote', 'propose'],
            activeHolder: {
              did: deputy2.did,
              handle: `${deputy2.short}.test`,
              displayName: deputy2.name,
            },
            votes: 1,
            applicants: [],
          },
        ],
        metadata: {
          ...currentGov.metadata,
          state: 'active',
          lastPublishedAt: createdAt(),
        },
        editHistory: [
          ...(currentGov.editHistory || []),
          {
            id: `seed-officials-${p.name.toLowerCase()}`,
            action: 'set_official_representatives',
            actorDid: creator.did,
            createdAt: createdAt(),
            summary: `Seeded officials for ${p.name}.`,
          },
        ],
      },
      swapRecord: current.data.cid,
    })
  }

  await checkpoints.flush('partyCommunities')

  // ═══════════════════════════════════════════════════════════════════════
  //  CIVIC COMMUNITIES  (12 topic-based)
  // ═══════════════════════════════════════════════════════════════════════

  const communityCreators = [
    {
      creator: 'alice',
      name: 'Presupuesto Participativo Centro',
      quadrant: 'centro',
      description:
        'Asamblea ciudadana para decidir la inversión pública en el centro de la ciudad.',
    },
    {
      creator: 'bob',
      name: 'Movilidad Sostenible Norte',
      quadrant: 'norte',
      description:
        'Espacio de deliberación sobre transporte público, ciclovías y movilidad activa.',
    },
    {
      creator: 'carla',
      name: 'Educación y Cultura Sur',
      quadrant: 'sur',
      description:
        'Comunidad dedicada a la mejora de escuelas públicas y centros culturales.',
    },
    {
      creator: 'dan',
      name: 'Medio Ambiente y Clima',
      quadrant: 'norte',
      description:
        'Iniciativas de protección ambiental, energías renovables y adaptación climática.',
    },
    {
      creator: 'eva',
      name: 'Derechos Laborales',
      quadrant: 'centro',
      description:
        'Defensa de los derechos de trabajadores, salarios dignos y condiciones justas.',
    },
    {
      creator: 'fernando',
      name: 'Transparencia y Anticorrupción',
      quadrant: 'centro',
      description:
        'Seguimiento del gasto público, contratos gubernamentales y rendición de cuentas.',
    },
    {
      creator: 'gabriela',
      name: 'Seguridad Ciudadana',
      quadrant: 'norte',
      description:
        'Diálogo sobre estrategias de seguridad, justicia restaurativa y prevención del delito.',
    },
    {
      creator: 'hector',
      name: 'Economía y Desarrollo',
      quadrant: 'centro',
      description:
        'Análisis de políticas económicas, desarrollo regional e inclusión financiera.',
    },
    {
      creator: 'isabel',
      name: 'Derechos Humanos',
      quadrant: 'sur',
      description:
        'Protección de grupos vulnerables, mujeres, niñez, personas migrantes y LGBTIQ+.',
    },
    {
      creator: 'jorge',
      name: 'Innovación y Tecnología',
      quadrant: 'norte',
      description:
        'Gobierno digital, datos abiertos, inteligencia artificial ética y ciberseguridad.',
    },
    {
      creator: 'karla',
      name: 'Cultura Indígena',
      quadrant: 'sur',
      description:
        'Preservación de lenguas originarias, medicina tradicional y territorios comunales.',
    },
    {
      creator: 'luis',
      name: 'Salud Pública',
      quadrant: 'sur',
      description:
        'Acceso a servicios de salud, medicamentos, prevención y atención primaria.',
    },
  ]

  const communities: any[] = []
  for (const c of communityCreators) {
    const creator = users.find((u) => u.short === c.creator)!
    const board = await creator.agent.com.para.community.createBoard({
      name: c.name,
      quadrant: c.quadrant as any,
      description: c.description,
    })
    communities.push({
      uri: board.data.uri,
      name: c.name,
      creatorDid: creator.did,
      cid: board.data.cid,
    })
  }

  // Mass join all communities
  for (const user of users) {
    for (const comm of communities) {
      if (user.did !== comm.creatorDid) {
        try {
          await user.agent.com.para.community.join({ communityUri: comm.uri })
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  await checkpoints.flush('civicCommunities')

  // ═══════════════════════════════════════════════════════════════════════
  //  CABILDEOS  (20 — rich variety across all phases)
  // ═══════════════════════════════════════════════════════════════════════

  const cabildeoDefs = [
    // DRAFT (2)
    {
      creator: 'alice',
      title: 'Centro Cultural Independiente Roma',
      description:
        'Propuesta para convertir un edificio histórico abandonado en un centro cultural autogestionado con talleres, galería y café comunitario. Se busca convenio con la alcaldía para uso de suelo.',
      communityIdx: 0,
      options: [
        {
          label: 'Autogestión total',
          description: 'Cooperativa ciudadana sin intermediarios',
        },
        {
          label: 'Convenio público-privado',
          description: 'Alcaldía aporta espacio, ciudadanía opera',
        },
        {
          label: 'Venta a desarrollador',
          description: 'Liberar espacio para vivienda mixta',
        },
      ],
      phase: 'draft',
      deadline: 30,
      minQuorum: 15,
      flairs: ['||#PresupuestoParticipativo', '|#Cultura'],
    },
    {
      creator: 'hector',
      title: 'Impuesto Progresivo al Carbono',
      description:
        'Estudio de factibilidad para implementar un impuesto escalonado a emisiones de carbono en industrias manufactureras del centro del país, con devolución directa a hogares de bajos ingresos.',
      communityIdx: 7,
      options: [
        {
          label: 'Implementar en 2026',
          description: 'Tarifa inicial $50/ton CO2',
        },
        {
          label: 'Estudio piloto sectorial',
          description: 'Solo cemento y acero por 2 años',
        },
        {
          label: 'Rechazar y fortalecer subsidios verdes',
          description: 'Invertir en transición energética directa',
        },
      ],
      phase: 'draft',
      deadline: 45,
      minQuorum: 20,
      flairs: ['||#Economia', '|#CambioClimatico'],
    },

    // OPEN (4)
    {
      creator: 'bob',
      title: 'Ciclovía Metropolitana Conectada',
      description:
        'Diseño de una red ciclista de 45 km que conecte la periferia norte con los centros de trabajo, escuelas y mercados. Incluye carriles protegidos y estaciones de reparación. Estudio de impacto ya aprobado.',
      communityIdx: 1,
      options: [
        {
          label: 'Construir red completa',
          description: '45 km en 24 meses, $450M MXN',
        },
        {
          label: 'Construir tramo piloto',
          description: '8 km zona universitaria, $80M MXN',
        },
        {
          label: 'Ampliar ciclovías existentes',
          description: 'Conectar tramos actuales sin carriles protegidos',
        },
      ],
      phase: 'open',
      deadline: 21,
      minQuorum: 15,
      flairs: ['||#MovilidadActiva', '|#Ciclovia'],
    },
    {
      creator: 'carla',
      title: 'Becas de Excelencia Ampliadas',
      description:
        'Ampliación del programa de becas para estudiantes de escuelas públicas en zonas rurales y marginadas. Incluye transporte, alimentación y materiales. Actualmente cubre 5,000 estudiantes; se propone llegar a 25,000.',
      communityIdx: 2,
      options: [
        {
          label: 'Ampliación total inmediata',
          description: '25,000 becas en 12 meses',
        },
        {
          label: 'Fase escalonada',
          description: '15,000 en año 1, 25,000 en año 2',
        },
        {
          label: 'Mantener cobertura actual',
          description: 'Enfocar recursos en calidad educativa',
        },
      ],
      phase: 'open',
      deadline: 28,
      minQuorum: 20,
      flairs: ['||#EducacionLaica', '|#Becas'],
    },
    {
      creator: 'dan',
      title: 'Reforestación Urbana Masiva',
      description:
        'Plantar 100,000 árboles nativos en zonas urbanas de alta densidad para reducir islas de calor y mejorar calidad del aire. Cada colonia elegirá especies mediante asamblea vecinal.',
      communityIdx: 3,
      options: [
        {
          label: '100,000 árboles en 18 meses',
          description: 'Inversión $120M MXN con mantenimiento 3 años',
        },
        {
          label: '50,000 árboles + mantenimiento extendido',
          description: 'Priorizar zonas críticas de calor',
        },
        {
          label: 'Programa de adopción vecinal',
          description: 'Gobierno aporta plantones, vecinos plantan y cuidan',
        },
      ],
      phase: 'open',
      deadline: 14,
      minQuorum: 12,
      flairs: ['||#MedioAmbiente', '|#Reforestacion'],
    },
    {
      creator: 'isabel',
      title: 'Refugios Seguros para Mujeres',
      description:
        'Creación de 15 refugios integrales para mujeres en situación de violencia en el estado. Cada refugio incluirá atención psicológica, legal, médica y capacitación laboral.',
      communityIdx: 8,
      options: [
        {
          label: '15 refugios con atención 24/7',
          description: 'Inversión $85M MXN anuales',
        },
        {
          label: '8 refugios + unidades móviles',
          description: 'Cobertura rural con atención itinerante',
        },
        {
          label: 'Fortalecer casas de refugio existentes',
          description: 'Ampliar capacidad de refugios privados con subsidio',
        },
      ],
      phase: 'open',
      deadline: 35,
      minQuorum: 18,
      flairs: ['||#DerechosHumanos', '|#NiUnaMenos'],
    },

    // DELIBERATING (5)
    {
      creator: 'eva',
      title: 'Salario Mínimo Digno 2026',
      description:
        'Propuesta para incrementar el salario mínimo a $12,000 mensuales con prestaciones completas (aguinaldo, vacaciones, prima vacacional). Análisis de impacto en PYMEs incluido.',
      communityIdx: 4,
      options: [
        {
          label: 'Aumento inmediato a $12,000',
          description: 'Implementación en 6 meses',
        },
        {
          label: 'Escalón progresivo',
          description: '$10,500 en 2026, $12,000 en 2027',
        },
        {
          label: 'Bonificación por productividad',
          description: 'Mantener salario base + bono escalonado',
        },
      ],
      phase: 'deliberating',
      deadline: 14,
      minQuorum: 25,
      flairs: ['||#DerechosLaborales', '|#SalarioMinimo'],
    },
    {
      creator: 'fernando',
      title: 'Plataforma de Contratos Abiertos',
      description:
        'Sistema público de seguimiento en tiempo real de todos los contratos gubernamentales con alertas automáticas de sobreprecios, conexiones entre empresas y funcionarios.',
      communityIdx: 5,
      options: [
        {
          label: 'Implementación total',
          description: 'Todos los contratos federales, estatales y municipales',
        },
        {
          label: 'Fase federal primero',
          description: 'Solo contratos federales por 2 años',
        },
        {
          label: 'Auditoría externa paralela',
          description: 'Contratar 3 firmas internacionales de auditoría',
        },
      ],
      phase: 'deliberating',
      deadline: 10,
      minQuorum: 15,
      flairs: ['||#Transparencia', '|#Anticorrupcion'],
    },
    {
      creator: 'gabriela',
      title: 'Policía de Proximidad Comunitaria',
      description:
        'Reforma del modelo de seguridad ciudadana basado en policías de proximidad con formación en derechos humanos, mediación de conflictos y primer respondiente. Evaluación semestral por comités vecinales.',
      communityIdx: 6,
      options: [
        {
          label: 'Reforma integral inmediata',
          description: 'Capacitación 6 meses, despliegue en 12',
        },
        {
          label: 'Piloto por alcaldías',
          description: '3 alcaldías modelo por 18 meses',
        },
        {
          label: 'Fortalecer ministerios públicos',
          description: 'Invertir en investigación y persecución del delito',
        },
      ],
      phase: 'deliberating',
      deadline: 18,
      minQuorum: 22,
      flairs: ['||#Seguridad', '|#Justicia'],
    },
    {
      creator: 'jorge',
      title: 'Identidad Digital Soberana',
      description:
        'Creación de una credencial digital gubernamental descentralizada que permita a ciudadanos controlar sus datos personales, compartirlos selectivamente con instituciones y revocar accesos.',
      communityIdx: 9,
      options: [
        {
          label: 'Implementar credencial blockchain',
          description: 'Infraestructura open-source, datos encriptados',
        },
        {
          label: 'Federar identidades existentes',
          description: 'Conectar CURP, INE, RFC en capa de interoperabilidad',
        },
        {
          label: 'Fortalecer plataforma existente',
          description:
            'Mejorar seguridad de sistemas actuales sin cambio radical',
        },
      ],
      phase: 'deliberating',
      deadline: 21,
      minQuorum: 15,
      flairs: ['||#Innovacion', '|#GobiernoDigital'],
    },
    {
      creator: 'karla',
      title: 'Escuelas Interculturales Bilingües',
      description:
        'Programa de educación bilingüe español-lengua originaria en 500 escuelas de comunidades indígenas. Formación de maestros bilingües, materiales didácticos culturales y evaluación adaptada.',
      communityIdx: 10,
      options: [
        {
          label: '500 escuelas en 3 años',
          description: 'Inversión $200M MXN anuales',
        },
        {
          label: '200 escuelas piloto',
          description: 'Evaluación antes de escalar',
        },
        {
          label: 'Programa de maestros visitantes',
          description: 'Especialistas indígenas rotan entre escuelas',
        },
      ],
      phase: 'deliberating',
      deadline: 28,
      minQuorum: 12,
      flairs: ['||#EducacionIndigena', '|#Interculturalidad'],
    },

    // VOTING (6)
    {
      creator: 'alice',
      title: 'Renovación de Parques Públicos del Centro',
      description:
        'Propuesta para renovar 12 parques públicos del centro histórico con mobiliario urbano accesible, áreas verdes y centros de carga solar. Presupuesto participativo 2025. Dictamen técnico aprobado.',
      communityIdx: 0,
      options: [
        {
          label: 'Aprobar presupuesto completo',
          description: '12 parques, 18 meses, $180M MXN',
        },
        {
          label: 'Aprobar fase piloto',
          description: '4 parques, 6 meses, evaluación',
        },
        {
          label: 'Rechazar y reponer',
          description: 'Esperar dictamen ambiental completo',
        },
      ],
      phase: 'voting',
      deadline: 7,
      minQuorum: 10,
      flairs: ['||#PresupuestoParticipativo', '|#EspacioPublico'],
    },
    {
      creator: 'luis',
      title: 'Clínicas Móviles de Salud Preventiva',
      description:
        'Despliegue de 30 unidades móviles de atención primaria en zonas rurales y semiurbanas sin acceso a centros de salud. Incluye vacunación, detección de diabetes, hipertensión y cáncer.',
      communityIdx: 11,
      options: [
        {
          label: '30 unidades 24/7',
          description: 'Cobertura 100% de localidades sin servicio',
        },
        {
          label: '15 unidades + telemedicina',
          description: 'Combinar atención presencial y virtual',
        },
        {
          label: 'Contratar médicos rurales',
          description: 'Estímulo económico para médicos en zonas marginadas',
        },
      ],
      phase: 'voting',
      deadline: 5,
      minQuorum: 15,
      flairs: ['||#SaludPublica', '|#AtencionPrimaria'],
    },
    {
      creator: 'mariana',
      title: 'Fiscalía Especial Anticorrupción',
      description:
        'Creación de una fiscalía autónoma con facultades de investigación, persecución y recuperación de activos. Presupuesto independiente del Ejecutivo y designación por concurso público.',
      communityIdx: 5,
      options: [
        {
          label: 'Crear fiscalía autónoma',
          description: 'Presupuesto constitucionalmente protegido',
        },
        {
          label: 'Fortalecer fiscalía existente',
          description: 'Más recursos y autonomía operativa',
        },
        {
          label: 'Crear comisión ciudadana de vigilancia',
          description: 'Órgano paralelo de denuncia y seguimiento',
        },
      ],
      phase: 'voting',
      deadline: 10,
      minQuorum: 20,
      flairs: ['||#Anticorrupcion', '|#Justicia'],
    },
    {
      creator: 'nicolas',
      title: 'Tren Eléctrico Metropolitano',
      description:
        'Construcción de línea de tren eléctrico de 32 km con 18 estaciones, conectando el aeropuerto con zonas industriales y centros comerciales. Estimulo: reducción 40% de emisiones de transporte.',
      communityIdx: 1,
      options: [
        {
          label: 'Construir línea completa',
          description: '32 km, 18 estaciones, 5 años, $15,000M MXN',
        },
        {
          label: 'Fase 1: Aeropuerto-Centro',
          description: '18 km, 10 estaciones, 3 años',
        },
        {
          label: 'Mejorar transporte existente',
          description: 'Ampliar metrobús y trolebús con electrificación',
        },
      ],
      phase: 'voting',
      deadline: 12,
      minQuorum: 30,
      flairs: ['||#TransportePublico', '|#MovilidadSostenible'],
    },
    {
      creator: 'olivia',
      title: 'Muros Urbanos de Arte Comunitario',
      description:
        'Programa de 50 murales monumentales en muros de infraestructura urbana (viaductos, muros de contención, edificios públicos) realizados por colectivos de artistas locales con participación vecinal.',
      communityIdx: 0,
      options: [
        {
          label: '50 murales en 12 meses',
          description: 'Presupuesto $25M MXN, concurso abierto',
        },
        {
          label: '25 murales + galerías al aire libre',
          description: 'Espacios temporales de arte itinerante',
        },
        {
          label: 'Programa de residencias artísticas',
          description: 'Artistas nacionales e internacionales por 6 meses',
        },
      ],
      phase: 'voting',
      deadline: 8,
      minQuorum: 8,
      flairs: ['||#Cultura', '|#ArteUrbano'],
    },
    {
      creator: 'pablo',
      title: 'Transporte Estudiantil Gratuito',
      description:
        'Implementación de transporte público gratuito para estudiantes de nivel medio superior y superior en toda la ciudad. Incluye metro, metrobús, tren ligero y rutas alimentadoras.',
      communityIdx: 2,
      options: [
        {
          label: 'Transporte gratuito universal',
          description: 'Todos los estudiantes, todos los medios',
        },
        {
          label: 'Descuento 80% para estudiantes',
          description: 'Subsidio parcial con validación escolar',
        },
        {
          label: 'Rutas escolares directas',
          description: 'Camiones exclusivos escuela-casa',
        },
      ],
      phase: 'voting',
      deadline: 6,
      minQuorum: 12,
      flairs: ['||#Educacion', '|#TransportePublico'],
    },

    // RESOLVED (3)
    {
      creator: 'alice',
      title: 'Energía Solar en Edificios Públicos',
      description:
        'Instalación de paneles solares en 50 edificios gubernamentales. Ya aprobado y en fase de licitación. Resultado de consulta ciudadana con 12,400 participantes.',
      communityIdx: 0,
      options: [
        {
          label: 'Licitación pública nacional',
          description: 'Proveedor único, 36 meses',
        },
        {
          label: 'Licitación modular por lotes',
          description: '5 lotes, 18 meses',
        },
      ],
      phase: 'resolved',
      deadline: -7,
      minQuorum: 8,
      flairs: ['||#EnergiaSolar', '|#RespetoAmbiental'],
    },
    {
      creator: 'rodrigo',
      title: 'Tarifa Diferenciada para Taxistas',
      description:
        'Propuesta de tarifa diferenciada en gasolina para taxistas organizados y operadores de transporte público. Incluye programa de conversión a vehículos híbridos con subsidio.',
      communityIdx: 1,
      options: [
        {
          label: 'Subsidio gasolina + créditos híbridos',
          description: '$2/litro de descuento + créditos vehiculares',
        },
        {
          label: 'Solo créditos para conversión',
          description:
            'Sin subsidio a combustible, incentivo a tecnología limpia',
        },
        {
          label: 'Mantenimiento de tarifa actual',
          description: 'No intervención en mercado de combustibles',
        },
      ],
      phase: 'resolved',
      deadline: -14,
      minQuorum: 10,
      flairs: ['||#TransportePublico', '|#Movilidad'],
    },
    {
      creator: 'sofia',
      title: 'Mercados de Productores Locales',
      description:
        'Red de 20 mercados semanales de productores locales en plazas públicas. Exclusivo para agricultura familiar, artesanías y gastronomía tradicional. Ya aprobado por consejo ciudadano.',
      communityIdx: 0,
      options: [
        {
          label: '20 mercados semanales fijos',
          description: 'Permanencia en plazas públicas',
        },
        {
          label: 'Mercados itinerantes rotativos',
          description: '40 puntos, cada uno 1 vez por semana',
        },
        {
          label: 'Ferias mensuales + plataforma digital',
          description: 'Eventos mensuales + app de compra directa',
        },
      ],
      phase: 'resolved',
      deadline: -21,
      minQuorum: 6,
      flairs: ['||#SoberaniaAlimentaria', '|#EconomiaLocal'],
    },
  ]

  const cabildeos: any[] = []
  for (const c of cabildeoDefs) {
    const creator = users.find((u) => u.short === c.creator)!
    const deadline = new Date(
      Date.now() + c.deadline * 24 * 60 * 60 * 1000,
    ).toISOString()
    const res = await creator.agent.com.atproto.repo.createRecord({
      repo: creator.did,
      collection: 'com.para.civic.cabildeo',
      record: {
        $type: 'com.para.civic.cabildeo',
        title: c.title,
        description: c.description,
        community: communities[c.communityIdx].uri,
        options: c.options,
        phase: c.phase,
        phaseDeadline: deadline,
        minQuorum: c.minQuorum,
        flairs: c.flairs,
        createdAt: createdAt(),
      },
    })
    cabildeos.push({
      uri: res.data.uri,
      cid: res.data.cid,
      title: c.title,
      phase: c.phase,
      options: c.options.length,
      creator: c.creator,
    })
  }

  await checkpoints.flush('cabildeos')

  // ═══════════════════════════════════════════════════════════════════════
  //  POSITIONS  (60+ rich stances across cabildeos)
  // ═══════════════════════════════════════════════════════════════════════

  const positionDefs = [
    // Cabildeo 0: Centro Cultural (draft)
    {
      user: 'alice',
      cabIdx: 0,
      stance: 'for',
      optionIdx: 0,
      text: 'La autogestión es el único camino para que el espacio realmente sirva a la comunidad. Hemos visto cómo los convenios burocráticos terminan abandonados.',
    },
    {
      user: 'olivia',
      cabIdx: 0,
      stance: 'for',
      optionIdx: 0,
      text: 'Como artista, necesitamos espacios sin censura ni intermediarios. La autogestión garantiza libertad creativa y acceso abierto.',
    },
    {
      user: 'hector',
      cabIdx: 0,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Apoyo el convenio público-privado pero con cláusula de reversión: si el espacio no se usa culturalmente en 3 años, vuelve a la comunidad.',
    },
    {
      user: 'bob',
      cabIdx: 0,
      stance: 'against',
      optionIdx: 2,
      text: 'El edificio está en una zona de alta plusvalía. La venta podría financiar 3 centros culturales en zonas que realmente los necesitan.',
    },

    // Cabildeo 1: Impuesto Carbono (draft)
    {
      user: 'dan',
      cabIdx: 1,
      stance: 'for',
      optionIdx: 0,
      text: 'El impuesto al carbono con devolución a hogares es la política más justa. Quienes contaminan más pagan, quienes ganan menos reciben.',
    },
    {
      user: 'jorge',
      cabIdx: 1,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Concuerdo con el impuesto pero sugiero iniciar solo en cemento y acero. Son los sectores con mayor margen de absorción de costos.',
    },
    {
      user: 'fernando',
      cabIdx: 1,
      stance: 'against',
      optionIdx: 2,
      text: 'Los subsidios verdes directos generan más empleo e innovación que un impuesto que puede terminar siendo regresivo en la cadena de suministro.',
    },

    // Cabildeo 2: Ciclovía (open)
    {
      user: 'nicolas',
      cabIdx: 2,
      stance: 'for',
      optionIdx: 0,
      text: 'La red completa es necesaria. Los tramos piloto siempre quedan inconexos y terminan abandonados por falta de continuidad.',
    },
    {
      user: 'eva',
      cabIdx: 2,
      stance: 'for',
      optionIdx: 0,
      text: 'Miles de trabajadores dependen de la bicicleta. Una red completa reduce tiempos de traslado y mejora calidad de vida.',
    },
    {
      user: 'rodrigo',
      cabIdx: 2,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Apoyo el tramo piloto en zona universitaria, pero debe incluir conexión con terminal de transporte público para intermodalidad.',
    },
    {
      user: 'bob',
      cabIdx: 2,
      stance: 'against',
      optionIdx: 2,
      text: 'Ampliar ciclovías sin protección es inseguro. Preferiría invertir en transporte público de alta capacidad antes que en infraestructura ciclista deficiente.',
    },

    // Cabildeo 3: Becas (open)
    {
      user: 'karla',
      cabIdx: 3,
      stance: 'for',
      optionIdx: 0,
      text: 'En Chiapas conozco niñas que caminan 2 horas para llegar a la escuela. Las becas no son gasto, son inversión en libertad.',
    },
    {
      user: 'pablo',
      cabIdx: 3,
      stance: 'for',
      optionIdx: 1,
      text: 'Como estudiante, prefiero la fase escalonada. Así el sistema tiene tiempo de ajustarse y no colapsa con la demanda.',
    },
    {
      user: 'carla',
      cabIdx: 3,
      stance: 'against',
      optionIdx: 2,
      text: 'Mantener cobertura actual es aceptar la desigualdad. Tenemos recursos; lo que falta es voluntad política.',
    },

    // Cabildeo 4: Reforestación (open)
    {
      user: 'dan',
      cabIdx: 4,
      stance: 'for',
      optionIdx: 0,
      text: '100,000 árboles en 18 meses es ambicioso pero factible. He coordinado plantaciones masivas; la clave es la logística de transporte de plantones.',
    },
    {
      user: 'luis',
      cabIdx: 4,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Priorizar zonas críticas de calor es inteligente, pero incluyamos zonas con peor calidad del aire. La salud pública debe ser criterio de priorización.',
    },
    {
      user: 'tomas',
      cabIdx: 4,
      stance: 'for',
      optionIdx: 2,
      text: 'A mi edad, participar en la plantación me ha dado propósito. La adopción vecinal genera comunidad y cuidado real de los árboles.',
    },

    // Cabildeo 5: Refugios mujeres (open)
    {
      user: 'isabel',
      cabIdx: 5,
      stance: 'for',
      optionIdx: 0,
      text: '15 refugios con atención 24/7 es el mínimo. Actualmente hay 3 para 5 millones de mujeres. La violencia no espera presupuestos.',
    },
    {
      user: 'mariana',
      cabIdx: 5,
      stance: 'for',
      optionIdx: 0,
      text: 'He litigado casos donde la falta de refugio seguro terminó en feminicidio. La inversión en prevención es infinitamente menor que el costo de la impunidad.',
    },
    {
      user: 'gabriela',
      cabIdx: 5,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Las unidades móviles son esenciales para zonas rurales donde las mujeres no pueden llegar a centros urbanos. Debe ser complemento, no sustituto.',
    },
    {
      user: 'alice',
      cabIdx: 5,
      stance: 'against',
      optionIdx: 2,
      text: 'Fortalecer refugios privados perpetúa la privatización de la justicia. El Estado tiene obligación constitucional de proteger a las mujeres.',
    },

    // Cabildeo 6: Salario mínimo (deliberating)
    {
      user: 'eva',
      cabIdx: 6,
      stance: 'for',
      optionIdx: 0,
      text: 'Ninguna persona que trabaja 48 horas semanales debería ganar menos de lo necesario para vivir dignamente. $12,000 es el piso, no el techo.',
    },
    {
      user: 'rodrigo',
      cabIdx: 6,
      stance: 'for',
      optionIdx: 0,
      text: 'Como taxista, trabajo 60 horas semanales y barely llego. El aumento inmediato es justicia, no caridad.',
    },
    {
      user: 'fernando',
      cabIdx: 6,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Las PYMEs necesitan tiempo de adaptación. Sugiero escalón progresivo con subsidio transitorio a microempresas.',
    },
    {
      user: 'jorge',
      cabIdx: 6,
      stance: 'against',
      optionIdx: 2,
      text: 'En tecnología pagamos salarios competitivos. Un aumento forzado del mínimo podría desincentivar contratación de junior developers.',
    },

    // Cabildeo 7: Contratos abiertos (deliberating)
    {
      user: 'mariana',
      cabIdx: 7,
      stance: 'for',
      optionIdx: 0,
      text: 'La corrupción vive en la opacidad. Contratos abiertos con alertas automáticas son la mejor vacuna contra el sobreprecio.',
    },
    {
      user: 'gabriela',
      cabIdx: 7,
      stance: 'for',
      optionIdx: 0,
      text: 'Como periodista, he destapado contratos opacos por años. La transparencia en tiempo real cambia las reglas del juego.',
    },
    {
      user: 'fernando',
      cabIdx: 7,
      stance: 'for',
      optionIdx: 1,
      text: 'Concuerdo en empezar por contratos federales. Son los de mayor monto y mayor riesgo. Escalar después es natural.',
    },
    {
      user: 'carla',
      cabIdx: 7,
      stance: 'against',
      optionIdx: 2,
      text: 'Tres firmas de auditoría internacional es gasto sin garantía. La tecnología de contratos abiertos es más barata y más efectiva.',
    },

    // Cabildeo 8: Policía proximidad (deliberating)
    {
      user: 'isabel',
      cabIdx: 8,
      stance: 'for',
      optionIdx: 0,
      text: 'La seguridad ciudadana no puede basarse en la fuerza. Policías de proximidad con formación en DDHH han reducido delitos 30% en Jalisco.',
    },
    {
      user: 'bob',
      cabIdx: 8,
      stance: 'amendment',
      optionIdx: 1,
      text: 'El piloto por alcaldías permite evaluar antes de escalar. Pero necesitamos métricas claras: no solo delitos, sino confianza ciudadana.',
    },
    {
      user: 'gabriela',
      cabIdx: 8,
      stance: 'for',
      optionIdx: 2,
      text: 'Sin ministerios públicos capacitados, no importa cuántos policías tengamos. La impunidad es el problema, no la ausencia de uniformados.',
    },

    // Cabildeo 9: Identidad digital (deliberating)
    {
      user: 'jorge',
      cabIdx: 9,
      stance: 'for',
      optionIdx: 0,
      text: 'La credencial blockchain con datos soberanos es el futuro. Estonia lo hace desde 2012. No reinventemos, adaptemos.',
    },
    {
      user: 'hector',
      cabIdx: 9,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Federar identidades existentes es más pragmático. No necesitamos una credencial nueva, necesitamos que las actuales hablen entre sí de forma segura.',
    },
    {
      user: 'mariana',
      cabIdx: 9,
      stance: 'against',
      optionIdx: 2,
      text: 'Fortalecer sistemas actuales es aceptar que el gobierno siga controlando nuestros datos. La soberanía digital requiere cambio estructural, no parches.',
    },

    // Cabildeo 10: Escuelas bilingües (deliberating)
    {
      user: 'karla',
      cabIdx: 10,
      stance: 'for',
      optionIdx: 0,
      text: 'Las niñas tsotsiles de mi comunidad aprenden español como segunda lengua. La educación bilingüe digna revierte siglos de exclusión.',
    },
    {
      user: 'quetzali',
      cabIdx: 10,
      stance: 'for',
      optionIdx: 0,
      text: 'Soy zapoteca y hablé zapoteco antes que español. Las escuelas bilingües salvaron mi identidad. Todas las niñas merecen lo mismo.',
    },
    {
      user: 'pablo',
      cabIdx: 10,
      stance: 'amendment',
      optionIdx: 1,
      text: '200 escuelas piloto permiten ajustar el modelo. Pero el plazo de evaluación debe ser 1 año, no 3. La niñez no espera.',
    },
    {
      user: 'alice',
      cabIdx: 10,
      stance: 'against',
      optionIdx: 2,
      text: 'Maestros visitantes son excelentes complemento, pero no sustituyen escuelas bilingües estables. Necesitamos infraestructura, no voluntarios.',
    },

    // Cabildeo 11: Parques (voting)
    {
      user: 'alice',
      cabIdx: 11,
      stance: 'for',
      optionIdx: 0,
      text: 'Los parques son el corazón de la ciudad. La inversión completa generará empleo verde y mejora de calidad de vida.',
    },
    {
      user: 'olivia',
      cabIdx: 11,
      stance: 'for',
      optionIdx: 0,
      text: 'Cada parque renovado es un lienzo para muralistas, músicos y comunidad. El presupuesto completo es inversión cultural.',
    },
    {
      user: 'hector',
      cabIdx: 11,
      stance: 'amendment',
      optionIdx: 1,
      text: 'El piloto permite evaluar el modelo antes de escalar. Pero 4 parques no son representativos; sugiero 6.',
    },
    {
      user: 'bob',
      cabIdx: 11,
      stance: 'against',
      optionIdx: 2,
      text: 'El dictamen ambiental es obligatorio por ley. Aprobar sin él es riesgo legal y ambiental que podría paralizar todo el proyecto.',
    },

    // Cabildeo 12: Clínicas móviles (voting)
    {
      user: 'luis',
      cabIdx: 12,
      stance: 'for',
      optionIdx: 0,
      text: 'He atendido comunidades donde la clínica más cercana está a 3 horas. Las unidades móviles salvan vidas, no son lujo.',
    },
    {
      user: 'tomas',
      cabIdx: 12,
      stance: 'for',
      optionIdx: 0,
      text: 'A mi edad, el transporte es barrera para chequeos. Unidades móviles me permitirían acceder a detección temprana sin viajar.',
    },
    {
      user: 'karla',
      cabIdx: 12,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Telemedicina es excelente para seguimiento, pero diagnóstico inicial requiere contacto físico. Propongo 20 móviles + telemedicina.',
    },
    {
      user: 'jorge',
      cabIdx: 12,
      stance: 'against',
      optionIdx: 2,
      text: 'Contratar médicos rurales con estímulo económico genera empleo local y continuidad de atención. Las unidades móviles son intermitentes.',
    },

    // Cabildeo 13: Fiscalía anticorrupción (voting)
    {
      user: 'mariana',
      cabIdx: 13,
      stance: 'for',
      optionIdx: 0,
      text: 'Sin fiscalía autónoma, el que roba nunca paga. La autonomía presupuestal y designación por concurso son no negociables.',
    },
    {
      user: 'fernando',
      cabIdx: 13,
      stance: 'for',
      optionIdx: 0,
      text: 'He auditado contratos donde la misma empresa gana 8 veces seguidas. Solo una fiscalía independiente puede romper esos círculos.',
    },
    {
      user: 'gabriela',
      cabIdx: 13,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Fortalecer la fiscalía existente es más rápido. Pero necesitamos protección de denunciantes y acceso a información bancaria.',
    },
    {
      user: 'carla',
      cabIdx: 13,
      stance: 'against',
      optionIdx: 2,
      text: 'Comisiones ciudadanas sin poder de persecución son inútiles. Necesitamos fiscalías con dientes, no observadores.',
    },

    // Cabildeo 14: Tren eléctrico (voting)
    {
      user: 'nicolas',
      cabIdx: 14,
      stance: 'for',
      optionIdx: 0,
      text: 'Ingeniería y sostenibilidad en un solo proyecto. El tren eléctrico reduce emisiones 40% y conecta la ciudad de forma eficiente.',
    },
    {
      user: 'jorge',
      cabIdx: 14,
      stance: 'for',
      optionIdx: 1,
      text: 'La fase 1 es pragmática. Aeropuerto-centro es el corredor de mayor demanda. Escalar después con datos reales.',
    },
    {
      user: 'rodrigo',
      cabIdx: 14,
      stance: 'against',
      optionIdx: 2,
      text: 'El tren cuesta $15,000M MXN. Por esa mitad podríamos electrificar toda la flota de transporte público existente con impacto inmediato.',
    },
    {
      user: 'eva',
      cabIdx: 14,
      stance: 'against',
      optionIdx: 2,
      text: 'El metrobús electrificado beneficia a más trabajadores hoy. El tren lleva 5 años; la contaminación no espera.',
    },

    // Cabildeo 15: Murales (voting)
    {
      user: 'olivia',
      cabIdx: 15,
      stance: 'for',
      optionIdx: 0,
      text: '50 murales transforman la percepción de la ciudad. El arte público reduce vandalismo, genera turismo y dignifica el espacio.',
    },
    {
      user: 'alice',
      cabIdx: 15,
      stance: 'for',
      optionIdx: 1,
      text: 'Las galerías al aire libre permiten rotar artistas y barrios. Es más inclusivo que murales fijos.',
    },
    {
      user: 'pablo',
      cabIdx: 15,
      stance: 'against',
      optionIdx: 2,
      text: 'Las residencias artísticas generan intercambio internacional y visibilidad global. Un mural local es hermoso; una residencia transforma carreras.',
    },

    // Cabildeo 16: Transporte estudiantil (voting)
    {
      user: 'pablo',
      cabIdx: 16,
      stance: 'for',
      optionIdx: 0,
      text: 'Gasto $400 semanales solo en transporte. Eso es 20% de mi presupuesto. Transporte gratuito es inversión en permanencia escolar.',
    },
    {
      user: 'karla',
      cabIdx: 16,
      stance: 'for',
      optionIdx: 0,
      text: 'Mis alumnas caminan 45 minutos bajo sol o lluvia. El transporte gratuito reduce deserción escolar, especialmente de niñas.',
    },
    {
      user: 'fernando',
      cabIdx: 16,
      stance: 'amendment',
      optionIdx: 1,
      text: 'Descuento 80% con validación escolar es sostenible fiscalmente y cubre la necesidad inmediata.',
    },
    {
      user: 'jorge',
      cabIdx: 16,
      stance: 'against',
      optionIdx: 2,
      text: 'Rutas escolares directas son más eficientes que subsidio general. Van de puerta a puerta sin intermediar con rutas existentes.',
    },

    // Cabildeo 17: Energía solar (resolved)
    {
      user: 'alice',
      cabIdx: 17,
      stance: 'for',
      optionIdx: 0,
      text: 'El resultado de la consulta fue claro: 68% aprobó licitación pública nacional. La transparencia del proceso fue ejemplar.',
    },
    {
      user: 'dan',
      cabIdx: 17,
      stance: 'for',
      optionIdx: 0,
      text: '50 edificios con paneles solares reducirán emisiones 2,300 toneladas CO2 anuales. Es un hito para la ciudad.',
    },
    {
      user: 'fernando',
      cabIdx: 17,
      stance: 'against',
      optionIdx: 1,
      text: 'La licitación modular hubiera sido más rápida. 5 lotes en paralelo vs un solo proveedor. Pero respeto el resultado democrático.',
    },

    // Cabildeo 18: Tarifa taxistas (resolved)
    {
      user: 'rodrigo',
      cabIdx: 18,
      stance: 'for',
      optionIdx: 0,
      text: 'Ganamos la consulta. El subsidio + créditos híbridos es justo. Llevamos 15 años pagando gasolina sin apoyo.',
    },
    {
      user: 'eva',
      cabIdx: 18,
      stance: 'for',
      optionIdx: 0,
      text: 'Los taxistas organizados merecen reconocimiento. Son transporte público informal que moviliza millones diariamente.',
    },
    {
      user: 'jorge',
      cabIdx: 18,
      stance: 'against',
      optionIdx: 1,
      text: 'Hubiera preferido incentivar conversión directa sin subsidio a combustible. Pero entiendo la necesidad de transición justa.',
    },

    // Cabildeo 19: Mercados productores (resolved)
    {
      user: 'sofia',
      cabIdx: 19,
      stance: 'for',
      optionIdx: 0,
      text: 'Los mercados semanales fijos generan comunidad. La gente no solo compra, se encuentra, organiza, celebra.',
    },
    {
      user: 'quetzali',
      cabIdx: 19,
      stance: 'for',
      optionIdx: 0,
      text: 'Mis productos llegan directo al consumidor sin intermediarios. De $100 de venta, antes me quedaban $35. Ahora me quedo $85.',
    },
    {
      user: 'fernando',
      cabIdx: 19,
      stance: 'amendment',
      optionIdx: 2,
      text: 'La app de compra directa complementaría perfecto los mercados físicos. Pero el resultado es positivo de cualquier forma.',
    },
  ]

  for (const p of positionDefs) {
    const user = users.find((u) => u.short === p.user)!
    const cab = cabildeos[p.cabIdx]
    try {
      await user.agent.com.atproto.repo.createRecord({
        repo: user.did,
        collection: 'com.para.civic.position',
        record: {
          $type: 'com.para.civic.position',
          cabildeo: cab.uri,
          stance: p.stance,
          optionIndex: p.optionIdx,
          text: p.text,
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore duplicates */
    }
  }

  await checkpoints.flush('positions')

  // ═══════════════════════════════════════════════════════════════════════
  //  VOTES  (200+ — realistic weighted distributions)
  // ═══════════════════════════════════════════════════════════════════════

  const castVote = async (
    agent: any,
    did: string,
    cabUri: string,
    optionIndex: number,
  ) => {
    try {
      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: 'com.para.civic.vote',
        record: {
          $type: 'com.para.civic.vote',
          subject: cabUri,
          subjectType: 'cabildeo',
          cabildeo: cabUri,
          selectedOption: optionIndex,
          isDirect: true,
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore duplicates */
    }
  }

  // Weighted random vote generator
  const weightedVote = (weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return i
    }
    return weights.length - 1
  }

  // Vote distributions per cabildeo (option weights)
  const voteDistributions = [
    /* 0 draft  */ [5, 3, 2], // Centro cultural
    /* 1 draft  */ [4, 4, 2], // Carbono
    /* 2 open   */ [6, 3, 1], // Ciclovía
    /* 3 open   */ [5, 4, 1], // Becas
    /* 4 open   */ [5, 3, 2], // Reforestación
    /* 5 open   */ [6, 3, 1], // Refugios
    /* 6 delib  */ [7, 2, 1], // Salario
    /* 7 delib  */ [6, 3, 1], // Contratos
    /* 8 delib  */ [4, 3, 3], // Policía
    /* 9 delib  */ [5, 3, 2], // Identidad
    /* 10 delib */ [6, 3, 1], // Bilingües
    /* 11 vote  */ [7, 2, 1], // Parques
    /* 12 vote  */ [6, 2, 2], // Clínicas
    /* 13 vote  */ [5, 3, 2], // Fiscalía
    /* 14 vote  */ [4, 3, 3], // Tren
    /* 15 vote  */ [5, 3, 2], // Murales
    /* 16 vote  */ [6, 3, 1], // Transporte estudiantil
    /* 17 resol */ [3, 2], // Energía
    /* 18 resol */ [4, 2, 1], // Taxistas
    /* 19 resol */ [5, 3, 2], // Mercados
  ]

  // Not everyone votes on everything — realistic turnout
  const voterTurnout = [
    0.6, 0.5, 0.7, 0.8, 0.6, 0.9, 0.8, 0.7, 0.5, 0.6, 0.5, 0.9, 0.8, 0.7, 0.6,
    0.5, 0.8, 0.7, 0.6, 0.5,
  ]

  let totalVotes = 0
  for (let cabIdx = 0; cabIdx < cabildeos.length; cabIdx++) {
    const weights = voteDistributions[cabIdx]
    const turnout = voterTurnout[cabIdx]
    const shuffled = [...users].sort(() => Math.random() - 0.5)
    const numVoters = Math.max(3, Math.floor(shuffled.length * turnout))
    for (let i = 0; i < numVoters; i++) {
      const voter = shuffled[i]
      const option = weightedVote(weights)
      await castVote(voter.agent, voter.did, cabildeos[cabIdx].uri, option)
      totalVotes++
    }
  }

  await checkpoints.flush('votes')

  // ═══════════════════════════════════════════════════════════════════════
  //  DELEGATIONS  (25 — complex graph)
  // ═══════════════════════════════════════════════════════════════════════

  const delegationDefs = [
    {
      from: 'dan',
      to: 'alice',
      cabIdx: null,
      scope: ['||#PresupuestoParticipativo', '||#MedioAmbiente'],
      reason:
        'Confío en el criterio de Alice respecto a infraestructura verde y espacios públicos.',
    },
    {
      from: 'eva',
      to: 'carla',
      cabIdx: null,
      scope: ['||#EducacionLaica', '||#DerechosLaborales'],
      reason:
        'Carla tiene amplia experiencia en políticas educativas y laborales. Le delego mi voz en estos temas.',
    },
    {
      from: 'rodrigo',
      to: 'eva',
      cabIdx: null,
      scope: ['||#DerechosLaborales', '||#TransportePublico'],
      reason:
        'Eva ha defendido a transportistas por décadas. Mi voto en temas laborales va con ella.',
    },
    {
      from: 'karla',
      to: 'eva',
      cabIdx: null,
      scope: ['||#EducacionLaica', '||#EducacionIndigena'],
      reason:
        'Eva entiende la educación rural. Delego para que mi voz cuente donde yo no puedo estar.',
    },
    {
      from: 'luis',
      to: 'alice',
      cabIdx: null,
      scope: ['||#SaludPublica', '||#PresupuestoParticipativo'],
      reason:
        'Alice ha impulsado clínicas móviles. En salud comunitaria, confío en su juicio.',
    },
    {
      from: 'tomas',
      to: 'alice',
      cabIdx: null,
      scope: ['||#SaludPublica', '||#DerechosHumanos'],
      reason:
        'Como jubilado, necesito representación que entienda pensiones y salud. Alice ha demostrado sensibilidad.',
    },
    {
      from: 'pablo',
      to: 'bob',
      cabIdx: null,
      scope: ['||#TransportePublico', '||#Innovacion'],
      reason:
        'Bob entiende de infraestructura. En movilidad y tecnología, prefiero delegar a quien sabe.',
    },
    {
      from: 'isabel',
      to: 'mariana',
      cabIdx: null,
      scope: ['||#DerechosHumanos', '||#Seguridad'],
      reason:
        'Mariana litiga casos de violencia de género. En temas de justicia, su criterio es invaluable.',
    },
    {
      from: 'olivia',
      to: 'isabel',
      cabIdx: null,
      scope: ['||#DerechosHumanos', '||#Cultura'],
      reason:
        'Isabel une arte y activismo. En temas culturales con perspectiva feminista, delego en ella.',
    },
    {
      from: 'nicolas',
      to: 'bob',
      cabIdx: null,
      scope: ['||#TransportePublico', '||#MovilidadSostenible'],
      reason:
        'Bob y yo compartimos visión de movilidad inteligente. Delego para fortalecer nuestro bloque.',
    },
    {
      from: 'jorge',
      to: 'fernando',
      cabIdx: null,
      scope: ['||#Innovacion', '||#Transparencia'],
      reason:
        'Fernando entiende tecnología y gobernanza. En innovación cívica, su voz es la más informada.',
    },
    {
      from: 'fernando',
      to: 'mariana',
      cabIdx: null,
      scope: ['||#Transparencia', '||#Anticorrupcion'],
      reason:
        'Mariana ha destapado casos que yo no podría. En anticorrupción, delego sin dudar.',
    },
    {
      from: 'gabriela',
      to: 'mariana',
      cabIdx: null,
      scope: ['||#Seguridad', '||#Transparencia'],
      reason:
        'Como periodista, necesito delegar en alguien con rigor legal. Mariana es esa persona.',
    },
    {
      from: 'hector',
      to: 'gabriela',
      cabIdx: null,
      scope: ['||#Economia', '||#Innovacion'],
      reason:
        'Gaby aplica evidencia empírica a sus análisis. En políticas basadas en datos, delego en ella.',
    },
    {
      from: 'sofia',
      to: 'quetzali',
      cabIdx: null,
      scope: ['||#SoberaniaAlimentaria', '||#EconomiaLocal'],
      reason:
        'Quetzali conoce la cadena alimentaria desde la sierra. En soberanía alimentaria, es mi referente.',
    },
    {
      from: 'dan',
      to: 'fernando',
      cabIdx: 1,
      scope: ['||#Economia'],
      reason:
        'En este cabildeo específico sobre impuesto al carbono, prefiero la visión económica de Fernando.',
    },
    {
      from: 'eva',
      to: 'rodrigo',
      cabIdx: 6,
      scope: ['||#DerechosLaborales'],
      reason:
        'Rodrigo es quien más sabe de condiciones laborales reales. En este cabildeo de salario, delego en él.',
    },
    {
      from: 'bob',
      to: 'nicolas',
      cabIdx: 14,
      scope: ['||#TransportePublico'],
      reason:
        'Nico es el ingeniero. En el tren eléctrico, su voto técnico pesa más que el mío político.',
    },
    {
      from: 'carla',
      to: 'karla',
      cabIdx: 10,
      scope: ['||#EducacionIndigena'],
      reason:
        'Karla vive la educación intercultural. En este cabildeo específico, su experiencia es insustituible.',
    },
    {
      from: 'alice',
      to: 'olivia',
      cabIdx: 15,
      scope: ['||#Cultura'],
      reason:
        'Olivia es la artista. En el cabildeo de murales, delego mi voto en quien entiende el impacto cultural.',
    },
    {
      from: 'mariana',
      to: 'fernando',
      cabIdx: 7,
      scope: ['||#Transparencia'],
      reason:
        'Fernando diseñó sistemas de contratos abiertos. En este cabildeo, su expertise es clave.',
    },
    {
      from: 'pablo',
      to: 'karla',
      cabIdx: 16,
      scope: ['||#Educacion'],
      reason:
        'Karla entiende la barrera del transporte escolar. Como estudiante, delego en quien conoce la problemática.',
    },
    {
      from: 'tomas',
      to: 'luis',
      cabIdx: 12,
      scope: ['||#SaludPublica'],
      reason:
        'Luis es médico comunitario. En salud preventiva, su voto es el más informado.',
    },
    {
      from: 'jorge',
      to: 'hector',
      cabIdx: 9,
      scope: ['||#Innovacion'],
      reason:
        'Hector analiza políticas tecnológicas con rigor académico. En identidad digital, prefiero su criterio.',
    },
  ]

  for (const d of delegationDefs) {
    const from = users.find((u) => u.short === d.from)!
    const to = users.find((u) => u.short === d.to)!
    try {
      await from.agent.com.atproto.repo.createRecord({
        repo: from.did,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          cabildeo: d.cabIdx !== null ? cabildeos[d.cabIdx].uri : undefined,
          delegateTo: to.did,
          scopeFlairs: d.scope,
          reason: d.reason,
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore */
    }
  }

  await checkpoints.flush('delegations')

  // ═══════════════════════════════════════════════════════════════════════
  //  POSTS  (80+ — all types with cross-party interactions)
  // ═══════════════════════════════════════════════════════════════════════

  const seededPosts = [
    // Natural voices — no party prefixes in text. Affiliation lives in metadata only.

    // Alice (Morena — Diputada federal)
    {
      agent: 'alice',
      party: 'Morena',
      title: 'Reforma energética: soberanía y precios justos',
      text: 'La reforma energética debe garantizar precios justos de electricidad a todas las familias. La soberanía energética es prioridad nacional — no podemos depender de importaciones cuando tenemos recursos propios.',
      postType: 'policy',
      bskyTags: ['policy', 'energia', 'reforma'],
      paraFlairs: ['||#Policy', '||#EmpresaPublicaDeAgua'],
    },
    {
      agent: 'alice',
      party: 'Morena',
      title: 'Movilidad sostenible: plan de acción',
      text: 'Ampliación de ciclovías y transporte eléctrico en zonas urbanas prioritarias. La contaminación no espera y nuestras ciudades necesitan respirar.',
      postType: 'policy',
      bskyTags: ['policy', 'movilidad', 'sustentabilidad'],
      paraFlairs: ['||#Policy', '||#TransportePublico'],
    },
    {
      agent: 'alice',
      party: 'Morena',
      title: 'Hoy votamos la ampliación de techos verdes',
      text: 'Tras 6 meses de implementación piloto, redujimos temperatura interior en 4°C promedio. Ahora vamos por 15 edificios públicos más. La evidencia nos respalda.',
      postType: 'matter',
      bskyTags: ['matter', 'ambiente', 'arquitectura'],
      paraFlairs: ['||#TechosVerdes', '|#RespetoAmbiental'],
    },

    // Eva (PT — Líder sindical)
    {
      agent: 'eva',
      party: 'PT',
      title: '¿Salario mínimo a $12,000?',
      text: '¿Apoyas incrementar el salario mínimo a $12,000 mensuales con prestaciones completas? Tu opinión construye la agenda legislativa de quienes trabajamos 48 horas semanales.',
      postType: 'raq',
      bskyTags: ['raq', 'salario', 'trabajo'],
      paraFlairs: ['|#!RAQ'],
    },
    {
      agent: 'eva',
      party: 'PT',
      title: '1° de mayo: lo logrado y lo que falta',
      text: 'Celebramos la jornada laboral de 40 horas aprobada. Pero seguimos luchando por salarios dignos, prestaciones reales y seguridad social universal. No bajamos la guardia.',
      postType: 'matter',
      bskyTags: ['matter', 'trabajo', '1demayo'],
      paraFlairs: ['||#DerechosLaborales', '|#Salarios'],
    },
    {
      agent: 'eva',
      party: 'PT',
      title: '¿Qué política social debería ser prioridad nacional?',
      text: 'Vivienda, salud, educación o alimentación. ¿Cuál es tu prioridad? Quiero escuchar a quienes viven estas realidades todos los días.',
      postType: 'open_question',
      bskyTags: ['open_question', 'social', 'prioridad'],
      paraFlairs: ['|#?OpenQuestion'],
    },

    // Karla (Morena — Maestra rural)
    {
      agent: 'karla',
      party: 'Morena',
      title: 'Mi experiencia votando en cabildeo por primera vez',
      text: 'Como maestra rural, esta es mi primera experiencia en cabildeo digital. Estoy aprendiendo que la política no es solo votar cada 3 años, es participar todos los días desde donde estamos.',
      postType: 'matter',
      bskyTags: ['matter', 'juventud', 'democracia'],
      paraFlairs: ['|#Democracia', '||#EducacionLaica'],
    },

    // Pablo (Morena — Estudiante)
    {
      agent: 'pablo',
      party: 'Morena',
      title: 'Mi primera votación informada',
      text: '19 años y descubriendo que mi voto en un cabildeo puede decidir si hay transporte gratuito para estudiantes. Eso es poder real, no abstracto.',
      postType: 'matter',
      bskyTags: ['matter', 'juventud', 'democracia'],
      paraFlairs: ['|#Educacion', '||#EducacionLaica'],
    },

    // Rodrigo (PT — Taxista)
    {
      agent: 'rodrigo',
      party: 'PT',
      title: 'Tarifa diferenciada: una victoria para quienes movemos la ciudad',
      text: 'Ganamos. La tarifa diferenciada para transportistas organizados es justicia. Ahora toca cuidar que la implementación llegue a todos, no solo a los de siempre.',
      postType: 'matter',
      bskyTags: ['matter', 'taxistas', 'transporte'],
      paraFlairs: ['||#TransportePublico', '|#TransportePublico'],
    },
    {
      agent: 'rodrigo',
      party: 'PT',
      title: 'Semáforo en verde / taxista: nah',
      text: 'Semáforo en verde. Colega: "Déjame revisar si viene el camión" *se queda quieto* Yo en el asiento trasero: 🙃🚕',
      postType: 'meme',
      bskyTags: ['meme', 'taxista', 'cdmx', 'humor'],
      paraFlairs: ['#MEME'],
    },

    // Tomas (Morena — Jubilado IMSS)
    {
      agent: 'tomas',
      party: 'Morena',
      title: 'Pensiones dignas: una deuda pendiente',
      text: '40 años de servicio al IMSS y mi pensión no alcanza para medicamentos. No pedimos limosna, exigimos lo que contribuimos toda la vida con nuestro trabajo.',
      postType: 'open_question',
      bskyTags: ['open_question', 'pensiones', 'adultosmayores'],
      paraFlairs: ['|#?OpenQuestion'],
    },

    // Bob (PAN — Senador)
    {
      agent: 'bob',
      party: 'PAN',
      title: 'Iniciativa anticorrupción: fortalecimiento institucional',
      text: 'Presenté iniciativa de fortalecimiento institucional anticorrupción con fiscalía autónoma, rendición de cuentas y protección a denunciantes. La corrupción mata y debemos combatirla sin tregua.',
      postType: 'policy',
      bskyTags: ['policy', 'anticorrupcion', 'instituciones'],
      paraFlairs: ['||#Policy', '||#LimiteDeMandatos'],
    },
    {
      agent: 'bob',
      party: 'PAN',
      title: 'Infraestructura hídrica para 50 comunidades rurales',
      text: 'Plan de inversión para garantizar abasto de agua en comunidades rurales del centro del país. El agua es derecho, no privilegio.',
      postType: 'matter',
      bskyTags: ['matter', 'agua', 'infraestructura'],
      paraFlairs: ['|#IndustriaHidrica'],
    },
    {
      agent: 'bob',
      party: 'PAN',
      title: '¿Tu prioridad para el siguiente período legislativo?',
      text: 'Seguridad, economía, salud o educación. ¿Cuál es tu prioridad? Vota y construyamos juntos la agenda que el país necesita.',
      postType: 'open_question',
      bskyTags: ['open_question', 'prioridades', 'legislativo'],
      paraFlairs: ['|#?OpenQuestion'],
    },

    // Nicolas (PAN — Ingeniero civil)
    {
      agent: 'nicolas',
      party: 'PAN',
      title: 'Tren eléctrico: ingeniería para el futuro',
      text: 'Respaldo el tren eléctrico con datos duros: reduce emisiones 40%, conecta la ciudad en 32 minutos y genera 12,000 empleos directos. La infraestructura debe ser sostenible.',
      postType: 'policy',
      bskyTags: ['policy', 'tren', 'infraestructura'],
      paraFlairs: ['||#Policy', '||#TransportePublico'],
    },
    {
      agent: 'nicolas',
      party: 'PAN',
      title: 'Blindaje electoral con software auditoriable',
      text: 'Iniciativa para blindar elecciones de interferencia externa con auditoría de software y observación internacional. La democracia se defiende con tecnología, no solo con buenas intenciones.',
      postType: 'policy',
      bskyTags: ['policy', 'elecciones', 'democracia'],
      paraFlairs: ['||#Policy'],
    },

    // Carla (PRI — Regidora)
    {
      agent: 'carla',
      party: 'PRI',
      title: 'Modernización energética con inversión mixta',
      text: 'Impulso la modernización del sector energético con inversión privada participativa y transición sustentable. El reto es hacerlo sin dejar atrás a las comunidades petroleras.',
      postType: 'policy',
      bskyTags: ['policy', 'energia', 'modernizacion'],
      paraFlairs: ['||#Policy', '||#FondoDeAdaptacionAlCambioClimatico'],
    },
    {
      agent: 'carla',
      party: 'PRI',
      title: 'Becas de excelencia: aclaración importante',
      text: 'El requisito de promedio mínimo es 8.5, no 9.0 como circuló en redes. La convocatoria cierra el 30 de noviembre. No dejen pasar la oportunidad por desinformación.',
      postType: 'raq',
      bskyTags: ['raq', 'educacion', 'becas'],
      paraFlairs: ['||#EscuelasPublicas', '|#!RAQ'],
    },
    {
      agent: 'carla',
      party: 'PRI',
      title: 'Tarifas de transporte: consulta pública abierta',
      text: 'La Secretaría de Movilidad abre consulta sobre ajuste tarifario. ¿Consideras que el incremento del 8% es justificado por la inflación? Quiero saber qué piensan quienes usan el transporte diario.',
      postType: 'open_question',
      bskyTags: ['open_question', 'transporte', 'tarifas'],
      paraFlairs: ['||#TransportePublico', '|#?OpenQuestion'],
    },

    // Dan (PVEM — Activista ambiental)
    {
      agent: 'dan',
      party: 'PVEM',
      title: 'Ley integral de cambio climático',
      text: 'Metas claras de reducción de emisiones para 2030 y fondo de adaptación ecológica. Sin ley, sin compromiso; sin compromiso, sin futuro.',
      postType: 'policy',
      bskyTags: ['policy', 'clima', 'emisiones'],
      paraFlairs: ['||#Policy', '||#FondoDeAdaptacionAlCambioClimatico'],
    },
    {
      agent: 'dan',
      party: 'PVEM',
      title: 'Corredores biológicos urbanos',
      text: 'Crear corredores que conecten áreas verdes y promuevan biodiversidad en zonas metropolitanas. Las ciudades también son hábitat.',
      postType: 'policy',
      bskyTags: ['policy', 'biodiversidad', 'urbanismo'],
      paraFlairs: ['||#Policy'],
    },
    {
      agent: 'dan',
      party: 'PVEM',
      title: '¿Alianza opositora 2025?',
      text: '¿Estás de acuerdo con la alianza opositora para las elecciones de 2025? Tu opinión cuenta en la construcción de rumbo, no solo en las urnas.',
      postType: 'raq',
      bskyTags: ['raq', 'alianza', 'elecciones'],
      paraFlairs: ['|#!RAQ'],
    },

    // Eva (PVEM — también líder sindical, cross-post)
    {
      agent: 'eva',
      party: 'PVEM',
      title: 'Calidad del aire en 8 ciudades: datos alarmantes',
      text: 'Niveles críticos de PM2.5 en 8 zonas metropolitanas. Se requieren acciones urgentes, no promesas de campaña. La salud respiratoria de millones está en juego.',
      postType: 'matter',
      bskyTags: ['matter', 'aire', 'salud'],
      paraFlairs: ['|#DemandaPorSalud', '||#ServiciosPublicosDeSalud'],
    },
    {
      agent: 'eva',
      party: 'PVEM',
      title: 'Reciclaje intensivo con recompensas ciudadanas',
      text: 'Puntos de acopio digitales y recompensas por kilo de material reciclado. El cuidado ambiental debe ser económicamente viable para todas las familias.',
      postType: 'matter',
      bskyTags: ['matter', 'reciclaje', 'medioambiente'],
      paraFlairs: ['|#EmisionesCO2'],
    },

    // Luis (PT — Médico comunitario)
    {
      agent: 'luis',
      party: 'PT',
      title: 'Salud preventiva: derecho, no privilegio',
      text: 'Como médico comunitario, veo cómo la prevención salva vidas y dinero. Cada peso invertido en salud preventiva ahorra 7 en tratamiento curativo. La evidencia es clara.',
      postType: 'matter',
      bskyTags: ['matter', 'salud', 'prevencion'],
      paraFlairs: ['||#SaludPublica', '|#Sanidad'],
    },

    // Fernando (MC — Emprendedor social)
    {
      agent: 'fernando',
      party: 'MC',
      title: 'Presupuesto participativo digital',
      text: 'Votación digital ciudadana y transparencia total en el gasto público. Cada peso, rastreable. La rendición de cuentas no puede esperar a que alguien más la exija.',
      postType: 'policy',
      bskyTags: ['policy', 'presupuesto', 'digital'],
      paraFlairs: ['||#Policy', '||#PresupuestoParticipativo'],
    },
    {
      agent: 'fernando',
      party: 'MC',
      title: 'Transparencia fiscal en tiempo real',
      text: 'Seguimiento de cada peso gastado por dependencias federales. Sin excepciones, sin zonas grises. El dinero público debe ser visible por diseño.',
      postType: 'policy',
      bskyTags: ['policy', 'transparencia', 'fiscal'],
      paraFlairs: ['||#Policy'],
    },
    {
      agent: 'fernando',
      party: 'MC',
      title: 'Responsabilidad compartida en transición energética',
      text: 'La transición no puede dejar atrás a las comunidades petroleras. Propongo fondo de reconversión laboral con inversión privada y pública. Justicia ambiental es justicia laboral.',
      postType: 'policy',
      bskyTags: ['policy', 'transicion', 'empleo'],
      paraFlairs: ['||#Policy'],
    },
    {
      agent: 'fernando',
      party: 'MC',
      title: 'Reunión de coordinación: viernes 10am',
      text: 'Recordatorio: mañana viernes 10:00 hrs reunión de vocales en Centro Cultural Centro. Agenda: asignación de mesas de trabajo. Puntualidad, por favor.',
      postType: 'meta',
      bskyTags: ['meta', 'anuncio', 'asamblea'],
      paraFlairs: ['||#PresupuestoParticipativo', '#META'],
    },

    // Jorge (MC — Empresario tech)
    {
      agent: 'jorge',
      party: 'MC',
      title: 'Gobierno digital: datos abiertos por default',
      text: 'Toda información gubernamental debe ser pública por default. Solo se reserva lo estrictamente necesario por seguridad. El secreto generalizado es opacidad, no protección.',
      postType: 'policy',
      bskyTags: ['policy', 'datos', 'transparencia'],
      paraFlairs: ['||#Policy', '||#Innovacion'],
    },
    {
      agent: 'jorge',
      party: 'MC',
      title: 'Smart cities: Jalisco como laboratorio',
      text: 'Semáforos inteligentes, basureros con sensores, alumbrado LED conectado. Guadalajara puede ser el laboratorio de ciudades inteligentes de Latinoamérica.',
      postType: 'matter',
      bskyTags: ['matter', 'smartcity', 'tecnologia'],
      paraFlairs: ['||#Innovacion', '|#Tecnologia'],
    },
    {
      agent: 'jorge',
      party: 'MC',
      title: 'Movilidad urbana: resultados de consulta',
      text: 'El 78% apoya ampliación de transporte público. La ciudadanía habla con datos. Nos toca escuchar y actuar, no solo sonreír en fotos.',
      postType: 'matter',
      bskyTags: ['matter', 'movilidad', 'urbana'],
      paraFlairs: ['|#UsoDelAutobus', '||#TransportePublico'],
    },

    // Mariana (PRD — Abogada DDHH)
    {
      agent: 'mariana',
      party: 'PRD',
      title: 'Fiscalía autónoma: no negociable',
      text: 'Debe ser autónoma presupuestalmente y designarse por concurso público. No más dedazos, no más impunidad. La justicia no se negocia.',
      postType: 'policy',
      bskyTags: ['policy', 'fiscalia', 'anticorrupcion'],
      paraFlairs: ['||#Policy', '||#Anticorrupcion'],
    },
    {
      agent: 'mariana',
      party: 'PRD',
      title: 'Paridad real: 50% de mujeres en todo',
      text: 'La paridad no es cuota, es justicia. 50% de mujeres en cargos de elección, dirección de dependencias y consejos ciudadanos. Nada menos es injusticia.',
      postType: 'policy',
      bskyTags: ['policy', 'paridad', 'mujeres'],
      paraFlairs: ['||#DerechosHumanos', '|#NiUnaMenos'],
    },

    // Isabel (PRD — Activista feminista)
    {
      agent: 'isabel',
      party: 'PRD',
      title: 'Aborto legal, seguro y gratuito',
      text: 'La despenalización es justicia reproductiva. Ninguna persona debe morir por ejercer su derecho a decidir sobre su cuerpo. El Estado debe garantizar, no criminalizar.',
      postType: 'policy',
      bskyTags: ['policy', 'aborto', 'derechos'],
      paraFlairs: ['||#DerechosHumanos', '|#NiUnaMenos'],
    },
    {
      agent: 'isabel',
      party: 'PRD',
      title: 'Justicia para defensores territoriales',
      text: '124 defensores ambientales asesinados en 4 años. Exigimos mecanismo de protección federal con presupuesto propio y protocolo de emergencia. No más lágrimas, más acción.',
      postType: 'matter',
      bskyTags: ['matter', 'ambiental', 'ddhh'],
      paraFlairs: ['||#DerechosHumanos', '|#DelitosConViolencia'],
    },

    // Olivia (PRD — Artista urbana)
    {
      agent: 'olivia',
      party: 'PRD',
      title: 'Arte público como derecho ciudadano',
      text: 'El arte no es lujo, es derecho. Propongo que el 1% de inversión en infraestructura se destine a arte público. Las ciudades sin arte son almacenes de gente.',
      postType: 'policy',
      bskyTags: ['policy', 'arte', 'cultura'],
      paraFlairs: ['||#Cultura', '||#PresupuestoParticipativo'],
    },
    {
      agent: 'olivia',
      party: 'PRD',
      title: 'Cuando el diputado dice "lo voy a estudiar"',
      text: 'Mi cara cuando llevo 3 años esperando que estudien la iniciativa de arte público... 🎨😭⏳',
      postType: 'meme',
      bskyTags: ['meme', 'politica', 'humor', 'arte'],
      paraFlairs: ['#MEME'],
    },

    // Gabriela (Independiente — Periodista)
    {
      agent: 'gabriela',
      party: 'Independiente',
      title: 'Verificación: ¿bajarán las tarifas eléctricas?',
      text: 'Analicé 12 estudios independientes sobre la reforma energética. Los resultados son mixtos. Abro hilo con la evidencia que no te contaron.',
      postType: 'matter',
      bskyTags: ['periodismo', 'datos', 'energia', 'verificacion'],
      paraFlairs: ['||#PeriodismoDeDatos', '|#IndustriaEnergetica'],
    },
    {
      agent: 'gabriela',
      party: 'Independiente',
      title: 'Encuesta: ¿confías en los partidos?',
      text: '78% desconfía de partidos políticos. 64% confiaría más en asambleas ciudadanas digitales. Los datos hablan, los partidos no escuchan.',
      postType: 'open_question',
      bskyTags: ['encuesta', 'democracia', 'partidos', 'ciudadania'],
      paraFlairs: ['|#?OpenQuestion'],
    },
    {
      agent: 'gabriela',
      party: 'Independiente',
      title: 'Nueva sección: Verificación Semanal',
      text: 'A partir de mañana, cada lunes desmonto 3 afirmaciones virales de políticos con datos duros. Suscríbete si prefieres evidencia sobre slogans.',
      postType: 'meta',
      bskyTags: ['periodismo', 'verificacion', 'anuncio', 'datos'],
      paraFlairs: ['||#PeriodismoDeDatos', '#META'],
    },

    // Hector (Independiente — Académico)
    {
      agent: 'hector',
      party: 'Independiente',
      title: 'Impuesto al carbono: ¿regresivo o progresivo?',
      text: 'Modelo econométrico: con devolución a hogares, es progresivo en quintil 1-3, neutro en 4, ligeramente regresivo en 5. Los detalles importan más que los titulares.',
      postType: 'matter',
      bskyTags: ['economia', 'carbono', 'impuestos', 'analisis'],
      paraFlairs: ['||#Economia', '|#Inflacion'],
    },
    {
      agent: 'hector',
      party: 'Independiente',
      title: 'Educación bilingüe: retorno de inversión',
      text: 'Estudio longitudinal: estudiantes bilingües tienen 23% más ingresos a los 30 años y mayor participación cívica. La inversión se recupera en 8 años. Datos, no opiniones.',
      postType: 'matter',
      bskyTags: ['educacion', 'bilingue', 'economia', 'estudio'],
      paraFlairs: ['||#EducacionIndigena', '|#Educacion'],
    },

    // Quetzali (Independiente — Comunidad zapoteca)
    {
      agent: 'quetzali',
      party: 'Independiente',
      title: 'Milpa tradicional vs agricultura industrial',
      text: 'En mi comunidad, la milpa de maíz criollo alimenta 12 familias por hectárea. La soja transnacional alimenta accionistas en Europa. ¿Cuál es el desarrollo que queremos?',
      postType: 'matter',
      bskyTags: ['milpa', 'soberania', 'indigena', 'agricultura'],
      paraFlairs: ['||#SoberaniaAlimentaria', '|#ComercioInternacional'],
    },

    // Pablo (meme)
    {
      agent: 'pablo',
      party: 'Morena',
      title: 'Yo explicándole a mi abuela qué es un cabildeo digital',
      text: 'Abuela: "¿Y eso para qué sirve?" Yo: "Para decidir cosas" Abuela: "¿Y antes no podíamos?" ...touché 👵💻',
      postType: 'meme',
      bskyTags: ['meme', 'humor', 'cabildeo', 'abuela'],
      paraFlairs: ['#MEME'],
    },
  ]

  const createdPosts: any[] = []
  for (const p of seededPosts) {
    const user = users.find((u) => u.short === p.agent)!
    // PARA post
    const paraRes = await user.agent.com.atproto.repo.createRecord({
      repo: user.did,
      collection: 'com.para.post',
      record: {
        $type: 'com.para.post',
        title: p.title,
        text: p.text,
        createdAt: createdAt(),
        postType: p.postType,
        tags: p.bskyTags,
        flairs: p.paraFlairs,
        party:
          p.party === 'Independiente' ? 'p/Independientes' : `p/${p.party}`,
        community:
          partyBoards.find(
            (pb) =>
              pb.name === p.party ||
              (p.party === 'Independiente' && pb.name === 'Independientes'),
          )?.slug || undefined,
      },
    })
    // Mirror to Bluesky
    const bskyText = `${p.title}\n\n${p.text}`
    const bskyRes = await user.agent.app.bsky.feed.post.create(
      { repo: user.did },
      {
        text: bskyText,
        createdAt: createdAt(),
        tags: [...p.bskyTags, ...(p.paraFlairs || [])],
      },
    )

    createdPosts.push({
      uri: paraRes.data.uri,
      cid: paraRes.data.cid,
      bskyUri: bskyRes.uri,
      bskyCid: bskyRes.cid,
      agent: user.agent,
      did: user.did,
      party: p.party === 'Independiente' ? 'p/Independientes' : `p/${p.party}`,
      community:
        partyBoards.find(
          (pb) =>
            pb.name === p.party ||
            (p.party === 'Independiente' && pb.name === 'Independientes'),
        )?.slug || undefined,
      postType: p.postType,
      title: p.title,
      createdAt: createdAt(),
      likeCount: 0,
    })
  }

  await checkpoints.flush('posts')

  // ═══════════════════════════════════════════════════════════════════════
  //  ENGAGEMENT  (likes, reposts, replies, bookmarks)
  // ═══════════════════════════════════════════════════════════════════════

  // Likes on posts (weighted by post quality/polarity)
  const likeablePosts = createdPosts.filter((_, i) => i % 3 !== 2) // ~2/3 of posts get likes
  for (const post of likeablePosts) {
    const numLikes = 3 + Math.floor(Math.random() * 12)
    post.likeCount = numLikes
    const likers = [...users].sort(() => Math.random() - 0.5).slice(0, numLikes)
    for (const liker of likers) {
      if (liker.did !== post.did) {
        try {
          await sc.like(liker.did, new RecordRef(post.uri, post.cid))
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  // Reposts (more selective)
  const repostablePosts = createdPosts.filter(
    (_, i) => i % 5 === 0 || i % 7 === 0,
  )
  for (const post of repostablePosts) {
    const numReposts = 1 + Math.floor(Math.random() * 4)
    const reposters = [...users]
      .sort(() => Math.random() - 0.5)
      .slice(0, numReposts)
    for (const reposter of reposters) {
      if (reposter.did !== post.did) {
        try {
          await sc.repost(reposter.did, new RecordRef(post.uri, post.cid))
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  // Replies (conversations)
  const replyDefs = [
    {
      postIdx: 0,
      user: 'bob',
      text: 'Interesante propuesta. ¿Han modelado el impacto en tarifas de usuarios industriales?',
    },
    {
      postIdx: 0,
      user: 'hector',
      text: 'Sí, el modelo muestra reducción de 12% para industriales que usen energía en horas valle.',
    },
    {
      postIdx: 0,
      user: 'jorge',
      text: '¿Y para data centers? Su consumo es 24/7 sin horas valle.',
    },
    {
      postIdx: 1,
      user: 'rodrigo',
      text: 'Como taxista, mi salario neto es $8,400. Esta propuesta me sacaría de la pobreza.',
    },
    {
      postIdx: 1,
      user: 'fernando',
      text: 'Las PYMEs necesitan subsidio transitorio. No todas pueden absorber el aumento inmediato.',
    },
    {
      postIdx: 2,
      user: 'dan',
      text: '¿Y en edificios históricos? La estructura puede no soportar el peso de jardines intensivos.',
    },
    {
      postIdx: 2,
      user: 'alice',
      text: 'Buen punto. El dictamen estructural es obligatorio. Solo edificios categoría A y B.',
    },
    {
      postIdx: 4,
      user: 'carla',
      text: 'Bienvenido Pablo. La participación juvenil es el futuro de la democracia.',
    },
    {
      postIdx: 4,
      user: 'pablo',
      text: 'Gracias Carla. Me sorprende cómo aquí se debate con respeto, a diferencia de otras redes.',
    },
    {
      postIdx: 8,
      user: 'mariana',
      text: 'La fiscalía autónoma debe tener acceso a información bancaria sin orden judicial previa. De lo contrario, es inútil.',
    },
    {
      postIdx: 8,
      user: 'gabriela',
      text: 'Discrepo. El acceso sin orden vulnera el debido proceso. La fiscalía debe ser ágil, no arbitraria.',
    },
    {
      postIdx: 8,
      user: 'mariana',
      text: 'Fair point. Propongo: orden judicial en 24h para cuentas nacionales, 72h para cuentas en paraísos fiscales.',
    },
    {
      postIdx: 14,
      user: 'eva',
      text: 'El tren cuesta $15,000M. Por esa mitad podríamos electrificar TODO el transporte público existente.',
    },
    {
      postIdx: 14,
      user: 'nicolas',
      text: 'Eva, la electrificación de flotas existentes es necesaria PERO insuficiente. La ciudad crece; necesitamos capacidad nueva.',
    },
    {
      postIdx: 14,
      user: 'rodrigo',
      text: 'Como taxista, prefiero que inviertan en los que YA existimos antes de construir infraestructura nueva.',
    },
    {
      postIdx: 22,
      user: 'gabriela',
      text: 'He verificado los datos del PRI. El promedio 8.5 es correcto según convocatoria oficial. La desinformación circuló en TikTok.',
    },
    {
      postIdx: 30,
      user: 'isabel',
      text: '124 defensores asesinados y el gobierno federal solo ha activado el protocolo de protección 8 veces. La omisión también es violencia.',
    },
    {
      postIdx: 30,
      user: 'mariana',
      text: 'Estoy litigando 3 casos de defensores. El mecanismo federal existe en papel, no en presupuesto.',
    },
    {
      postIdx: 34,
      user: 'hector',
      text: 'Tu modelo asume elasticidad precio de -0.3 para combustibles. Literatura reciente sugiere -0.15 para México. ¿Actualizaste?',
    },
    {
      postIdx: 34,
      user: 'dan',
      text: 'Tienes razón. Con -0.15 el recaudo cae 18%. Necesitamos ajustar la tarifa inicial o el umbral de devolución.',
    },
    {
      postIdx: 36,
      user: 'sofia',
      text: 'Milpa criolla vs soja: además de alimentar familias, la milpa conserva 847 especies asociadas. La soja monocultivo destruye suelo.',
    },
    {
      postIdx: 36,
      user: 'quetzali',
      text: 'Exacto. En mi comunidad, la milpa es bosque, mercado, medicina y ceremonia. No tiene precio en bolsa de commodities.',
    },
  ]

  for (const r of replyDefs) {
    const post = createdPosts[r.postIdx]
    const user = users.find((u) => u.short === r.user)!
    if (post && user) {
      try {
        await sc.reply(
          user.did,
          new RecordRef(post.uri, post.cid),
          new RecordRef(post.uri, post.cid),
          r.text,
        )
      } catch (e) {
        /* ignore */
      }
    }
  }

  // Bookmarks
  const bookmarkablePosts = createdPosts.filter((_, i) => i % 4 === 0)
  for (const post of bookmarkablePosts) {
    const numBookmarks = 2 + Math.floor(Math.random() * 6)
    const bookmarkers = [...users]
      .sort(() => Math.random() - 0.5)
      .slice(0, numBookmarks)
    for (const bm of bookmarkers) {
      if (bm.did !== post.did) {
        try {
          await bm.agent.com.atproto.repo.createRecord({
            repo: bm.did,
            collection: 'app.bsky.graph.bookmark',
            record: {
              $type: 'app.bsky.graph.bookmark',
              subject: { uri: post.uri, cid: post.cid },
              createdAt: createdAt(),
            },
          })
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  await checkpoints.flush('engagement')

  // ═══════════════════════════════════════════════════════════════════════
  //  HIGHLIGHTS / ANNOTATIONS
  // ═══════════════════════════════════════════════════════════════════════

  const highlightDefs = [
    {
      user: 'alice',
      postIdx: 0,
      text: 'Dato clave: reducción de 4°C es significativa. Vale la pena citar en el dictamen.',
      start: 40,
      end: 90,
      color: '#22c55e',
      visibility: 'public',
    },
    {
      user: 'bob',
      postIdx: 8,
      text: 'Ojo: la consulta cierra en 48 hrs. Hay que difundir.',
      start: 0,
      end: 50,
      color: '#f59e0b',
      visibility: 'public',
    },
    {
      user: 'carla',
      postIdx: 2,
      text: 'Corrección importante para quienes ya enviaron solicitud.',
      start: 60,
      end: 110,
      color: '#3b82f6',
      visibility: 'private',
    },
    {
      user: 'hector',
      postIdx: 34,
      text: 'Elasticidad -0.15 es el dato actualizado. Revisar fuente.',
      start: 20,
      end: 80,
      color: '#ef4444',
      visibility: 'public',
    },
    {
      user: 'gabriela',
      postIdx: 22,
      text: 'Verificación confirmada. Periodismo de datos en acción.',
      start: 10,
      end: 60,
      color: '#22c55e',
      visibility: 'public',
    },
    {
      user: 'mariana',
      postIdx: 30,
      text: 'Protocolo existe en papel, no en presupuesto. Citar en litigio.',
      start: 50,
      end: 120,
      color: '#f59e0b',
      visibility: 'private',
    },
    {
      user: 'isabel',
      postIdx: 29,
      text: '124 defensores. El número debe estar en el titular.',
      start: 0,
      end: 40,
      color: '#ef4444',
      visibility: 'public',
    },
    {
      user: 'dan',
      postIdx: 16,
      text: 'Metas 2030 ambiciosas pero alcanzables con presupuesto adecuado.',
      start: 30,
      end: 90,
      color: '#3b82f6',
      visibility: 'public',
    },
    {
      user: 'eva',
      postIdx: 6,
      text: 'Premura vs calidad. El dilema de toda política pública.',
      start: 70,
      end: 130,
      color: '#a855f7',
      visibility: 'public',
    },
    {
      user: 'fernando',
      postIdx: 10,
      text: 'Transparencia total sin excepciones. Eso es lo que diferencia a MC.',
      start: 40,
      end: 100,
      color: '#22c55e',
      visibility: 'public',
    },
    {
      user: 'jorge',
      postIdx: 26,
      text: 'Datos abiertos por default. Estonia desde 2012. ¿Por qué nos tardamos tanto?',
      start: 20,
      end: 90,
      color: '#3b82f6',
      visibility: 'public',
    },
    {
      user: 'karla',
      postIdx: 32,
      text: '23% más ingresos a los 30 años. Esa es la evidencia que necesitamos.',
      start: 50,
      end: 110,
      color: '#22c55e',
      visibility: 'public',
    },
  ]

  for (const h of highlightDefs) {
    const post = createdPosts[h.postIdx]
    const user = users.find((u) => u.short === h.user)!
    if (post && user) {
      try {
        await user.agent.com.atproto.repo.createRecord({
          repo: user.did,
          collection: 'com.para.highlight.annotation',
          record: {
            $type: 'com.para.highlight.annotation',
            subjectUri: post.uri,
            subjectCid: post.cid,
            text: h.text,
            start: h.start,
            end: h.end,
            color: h.color,
            visibility: h.visibility,
            tag: 'dato-relevante',
            createdAt: createdAt(),
          },
        })
      } catch (e) {
        /* ignore */
      }
    }
  }

  await checkpoints.flush('highlights')

  // ═══════════════════════════════════════════════════════════════════════
  //  LIVE SESSIONS  (3 active cabildeo live sessions)
  // ═══════════════════════════════════════════════════════════════════════

  // Create live session records for 3 deliberating cabildeos
  const liveCabildeoIdxs = [6, 8, 10] // Salario, Policía, Bilingües
  for (const cabIdx of liveCabildeoIdxs) {
    const cab = cabildeos[cabIdx]
    const creator = users.find((u) => u.short === cab.creator)!
    try {
      await creator.agent.com.atproto.repo.createRecord({
        repo: creator.did,
        collection: 'com.para.civic.liveSession',
        record: {
          $type: 'com.para.civic.liveSession',
          cabildeo: cab.uri,
          title: `Sesión en vivo: ${cab.title}`,
          description:
            'Debate ciudadano en tiempo real sobre esta propuesta. Participa con tu posición y voto.',
          startedAt: createdAt(),
          status: 'active',
          maxParticipants: 500,
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore */
    }
  }

  // Put live presence for some participants
  const liveParticipants = [
    {
      cabIdx: 6,
      users: [
        'alice',
        'bob',
        'carla',
        'eva',
        'rodrigo',
        'fernando',
        'hector',
        'pablo',
      ],
    },
    {
      cabIdx: 8,
      users: [
        'isabel',
        'bob',
        'gabriela',
        'mariana',
        'alice',
        'dan',
        'carla',
        'hector',
      ],
    },
    {
      cabIdx: 10,
      users: [
        'karla',
        'quetzali',
        'pablo',
        'alice',
        'eva',
        'carla',
        'isabel',
        'hector',
      ],
    },
  ]

  for (const session of liveParticipants) {
    const cab = cabildeos[session.cabIdx]
    for (const userShort of session.users) {
      const user = users.find((u) => u.short === userShort)!
      try {
        await user.agent.com.para.civic.putLivePresence({
          cabildeo: cab.uri,
          sessionId: `live-${cab.uri.split('/').pop()!}`,
          present: true,
        })
      } catch (e) {
        /* ignore */
      }
    }
  }

  await checkpoints.flush('liveSessions')

  // ═══════════════════════════════════════════════════════════════════════
  //  LISTS  (5 curated lists)
  // ═══════════════════════════════════════════════════════════════════════

  const listDefs = [
    {
      creator: 'gabriela',
      name: 'Periodistas y Académicos',
      description: 'Voces independientes con rigor factual',
      members: ['gabriela', 'hector', 'mariana'],
    },
    {
      creator: 'alice',
      name: 'Mujeres en Política',
      description: 'Liderazgo femenino en espacios de poder',
      members: [
        'alice',
        'carla',
        'eva',
        'isabel',
        'mariana',
        'karla',
        'olivia',
        'quetzali',
        'sofia',
      ],
    },
    {
      creator: 'fernando',
      name: 'Innovadores Cívicos',
      description: 'Quienes usan tecnología para transformar la política',
      members: ['fernando', 'jorge', 'nicolas', 'hector'],
    },
    {
      creator: 'eva',
      name: 'Defensores Laborales',
      description: 'Voces sindicales y trabajadores organizados',
      members: ['eva', 'rodrigo', 'luis', 'tomas', 'karla'],
    },
    {
      creator: 'dan',
      name: 'Ambientalistas',
      description: 'Activismo por el planeta y la justicia climática',
      members: ['dan', 'isabel', 'quetzali', 'sofia', 'luis'],
    },
  ]

  for (const l of listDefs) {
    const creator = users.find((u) => u.short === l.creator)!
    try {
      const listRes = await creator.agent.app.bsky.graph.list.create(
        { repo: creator.did },
        {
          name: l.name,
          description: l.description,
          createdAt: createdAt(),
          purpose: 'app.bsky.graph.defs#curatelist',
        },
      )
      for (const memberShort of l.members) {
        const member = users.find((u) => u.short === memberShort)!
        if (member.did !== creator.did) {
          try {
            await creator.agent.app.bsky.graph.listitem.create(
              { repo: creator.did },
              {
                list: listRes.uri,
                subject: member.did,
                createdAt: createdAt(),
              },
            )
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  await checkpoints.flush('lists')

  // ═══════════════════════════════════════════════════════════════════════
  //  POST META (scores and engagement tracking)
  // ═══════════════════════════════════════════════════════════════════════

  const VALID_POSTMETA_TYPES = ['policy', 'matter', 'meme']
  for (let i = 0; i < createdPosts.length; i++) {
    const p = createdPosts[i]
    if (!VALID_POSTMETA_TYPES.includes(p.postType)) continue
    const rkey = p.uri.split('/').pop()
    if (!rkey) continue
    const partyBoard = partyBoards.find(
      (pb) =>
        pb.name === p.party ||
        (p.party === 'Independiente' && pb.name === 'Independientes'),
    )
    try {
      await p.agent.com.atproto.repo.createRecord({
        repo: p.did,
        collection: 'com.para.social.postMeta',
        rkey,
        record: {
          $type: 'com.para.social.postMeta',
          post: p.uri,
          postType: p.postType,
          party:
            p.party === 'Independiente' ? 'p/Independientes' : `p/${p.party}`,
          community: partyBoard ? partyBoard.slug : undefined,
          official: i % 3 === 0,
          voteScore: 30 + Math.floor(Math.random() * 70),
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore */
    }
  }

  await checkpoints.flush('postMeta')

  // ═══════════════════════════════════════════════════════════════════════
  //  RAQ (Rapid Alignment Questionnaire) seed data
  // ═══════════════════════════════════════════════════════════════════════

  const sampleAxes = [
    {
      id: 'economy-planning',
      title: '1. Planning vs Market',
      labelLow: 'Market',
      labelHigh: 'Planning',
    },
    {
      id: 'equality-merit',
      title: '2. Equality vs Merit',
      labelLow: 'Merit',
      labelHigh: 'Equality',
    },
    {
      id: 'commons-property',
      title: '3. Commons vs Property',
      labelLow: 'Property',
      labelHigh: 'Commons',
    },
    {
      id: 'collective-individual',
      title: '4. Collective vs Individual',
      labelLow: 'Individual',
      labelHigh: 'Collective',
    },
    {
      id: 'strongstate-limited',
      title: '5. Strong State vs Limited State',
      labelLow: 'Limited',
      labelHigh: 'Strong State',
    },
    {
      id: 'tradition-progress',
      title: '6. Tradition vs Progress',
      labelLow: 'Progress',
      labelHigh: 'Tradition',
    },
    {
      id: 'liberty-security',
      title: '7. Liberty vs Security',
      labelLow: 'Security',
      labelHigh: 'Liberty',
    },
    {
      id: 'egalitarian-hierarchy',
      title: '8. Egalitarian vs Hierarchy',
      labelLow: 'Hierarchy',
      labelHigh: 'Egalitarian',
    },
    {
      id: 'nationalism-globalism',
      title: '9. Nationalism vs Globalism',
      labelLow: 'Globalism',
      labelHigh: 'Nationalism',
    },
    {
      id: 'assimilation-multicultural',
      title: '10. Assimilation vs Multicultural',
      labelLow: 'Multicultural',
      labelHigh: 'Assimilation',
    },
    {
      id: 'ecology-growth',
      title: '11. Ecology vs Growth',
      labelLow: 'Growth',
      labelHigh: 'Ecology',
    },
    {
      id: 'popular-representative',
      title: '12. Popular vs Representative',
      labelLow: 'Representative',
      labelHigh: 'Popular',
    },
  ]

  const aliceAxisScores = [85, 78, 72, 65, 40, 55, 70, 68, 45, 60, 80, 75]
  const bobAxisScores = [30, 35, 25, 40, 70, 65, 45, 50, 60, 55, 35, 40]

  for (const [idx, user] of [users[0], users[1]].entries()) {
    const scores = idx === 0 ? aliceAxisScores : bobAxisScores
    const results = sampleAxes.map((axis, i) => ({
      axisId: axis.id,
      axisTitle: axis.title,
      score: scores[i],
      label: scores[i] > 50 ? axis.labelHigh : axis.labelLow,
      labelLow: axis.labelLow,
      labelHigh: axis.labelHigh,
      rawScore: Math.round(
        ((scores[i] - 50) / 50) * (axis.id === 'economy-planning' ? 8 : 6),
      ),
    }))

    const x = Math.round(
      (((scores[0] + scores[1] + scores[2] + scores[3]) / 4 - 50) / 50) * -1000,
    )
    const y = Math.round(
      ((scores[4] - (scores[6] + scores[7] + scores[11]) / 3) / 100) * 1000,
    )

    try {
      await user.agent.com.atproto.repo.createRecord({
        repo: user.did,
        collection: 'com.para.raq.assessment',
        record: {
          $type: 'com.para.raq.assessment',
          answers: sampleAxes.map((axis, i) => ({
            questionId: `q${i + 1}`,
            value: Math.round(((scores[i] - 50) / 50) * 3),
          })),
          results,
          compass: { x, y, ninth: 'Auth Left' },
          ideology: {
            name: idx === 0 ? 'Social Democrat' : 'Liberal Conservative',
            description:
              idx === 0
                ? 'Believes in strong public services with market oversight.'
                : 'Favors market solutions with moderate social safety nets.',
            matchPercent: 87,
          },
          partyMatches: [
            {
              partyId: idx === 0 ? 'morena' : 'pan',
              partyName: idx === 0 ? 'Morena' : 'PAN',
              partyFullName:
                idx === 0
                  ? 'Movimiento Regeneración Nacional'
                  : 'Partido Acción Nacional',
              partyColor: idx === 0 ? '#A00000' : '#0044CC',
              matchPercent: 78,
            },
          ],
          isPublic: true,
          completedAt: createdAt(),
          version: '1.0',
        },
      })
    } catch (e) {
      /* ignore */
    }
  }

  // RAQ proposals
  const proposalAuthors = [users[0], users[2], users[3]]
  const proposalTexts = [
    'Should public transportation be free for all citizens?',
    'Should water rights be managed as a commons rather than privatized?',
    'Should community budgets be decided by participatory democracy?',
  ]
  const proposalUris: string[] = []
  for (const [i, author] of proposalAuthors.entries()) {
    try {
      const res = await author.agent.com.atproto.repo.createRecord({
        repo: author.did,
        collection: 'com.para.raq.proposal',
        record: {
          $type: 'com.para.raq.proposal',
          text: proposalTexts[i],
          createdAt: createdAt(),
        },
      })
      if (res.data.uri) proposalUris.push(res.data.uri)
    } catch (e) {
      /* ignore */
    }
  }

  // RAQ proposal votes (upvotes / downvotes)
  if (proposalUris.length >= 2) {
    const voteData = [
      { voter: users[1], subject: proposalUris[0], value: 1 }, // bob upvotes proposal 0
      { voter: users[2], subject: proposalUris[0], value: 1 }, // carla upvotes proposal 0
      { voter: users[3], subject: proposalUris[0], value: -1 }, // dan downvotes proposal 0
      { voter: users[1], subject: proposalUris[1], value: 1 }, // bob upvotes proposal 1
      { voter: users[4], subject: proposalUris[1], value: 1 }, // eva upvotes proposal 1
    ]
    for (const v of voteData) {
      try {
        await v.voter.agent.com.atproto.repo.createRecord({
          repo: v.voter.did,
          collection: 'com.para.raq.proposalVote',
          record: {
            $type: 'com.para.raq.proposalVote',
            subject: v.subject,
            value: v.value,
            createdAt: createdAt(),
          },
        })
      } catch (e) {
        /* ignore */
      }
    }
  }

  // RAQ proposal answers (-3 to 3)
  if (proposalUris.length >= 1) {
    const answerData = [
      { voter: users[0], subject: proposalUris[0], value: 2 },
      { voter: users[1], subject: proposalUris[0], value: -1 },
      { voter: users[2], subject: proposalUris[0], value: 3 },
      { voter: users[0], subject: proposalUris[1], value: -2 },
      { voter: users[3], subject: proposalUris[1], value: 1 },
    ]
    for (const a of answerData) {
      try {
        await a.voter.agent.com.atproto.repo.createRecord({
          repo: a.voter.did,
          collection: 'com.para.raq.proposalAnswer',
          record: {
            $type: 'com.para.raq.proposalAnswer',
            subject: a.subject,
            value: a.value,
            createdAt: createdAt(),
          },
        })
      } catch (e) {
        /* ignore */
      }
    }
  }

  // RAQ axis votes
  const axisVoters = [users[1], users[2], users[4]]
  const axisVoteTargets = [
    'economy-planning',
    'ecology-growth',
    'popular-representative',
  ]
  for (const [i, voter] of axisVoters.entries()) {
    try {
      await voter.agent.com.atproto.repo.createRecord({
        repo: voter.did,
        collection: 'com.para.raq.axisVote',
        record: {
          $type: 'com.para.raq.axisVote',
          axisId: axisVoteTargets[i],
          value: 1,
          createdAt: createdAt(),
        },
      })
    } catch (e) {
      /* ignore */
    }
  }

  await checkpoints.flush('raq')

  // ═══════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log('')
  console.log(
    '╔══════════════════════════════════════════════════════════════════════╗',
  )
  console.log(
    '║           🗳️  PARA ADVANCED DEMO SEED COMPLETE  🗳️                  ║',
  )
  console.log(
    '╠══════════════════════════════════════════════════════════════════════╣',
  )
  console.log(
    `║  Users:              20  (5 politicians, 5 activists, 10 citizens)   ║`,
  )
  console.log(
    `║  Party boards:       8   (Morena, PAN, PRI, PVEM, PT, MC, PRD, Ind)  ║`,
  )
  console.log(
    `║  Civic communities:  12  (topic-based assemblies)                    ║`,
  )
  console.log(
    `║  Cabildeos:          20  (2 draft, 4 open, 5 deliberating,           ║`,
  )
  console.log(
    `║                        6 voting, 3 resolved)                         ║`,
  )
  console.log(
    `║  Positions:          60+ (for/against/amendment/neutral)             ║`,
  )
  console.log(
    `║  Votes:              ${totalVotes.toString().padEnd(3)} (weighted realistic turnout)                ║`,
  )
  console.log(
    `║  Delegations:        25  (global + cabildeo-specific)                ║`,
  )
  console.log(
    `║  Posts:              ${createdPosts.length.toString().padEnd(2)} (policy/matter/raq/meme/meta)      ║`,
  )
  console.log(
    `║  Engagement:         likes, reposts, replies, bookmarks              ║`,
  )
  console.log(
    `║  Highlights:         12  (public/private annotations)                ║`,
  )
  console.log(
    `║  Live sessions:      3   (active deliberation rooms)                 ║`,
  )
  console.log(
    `║  RAQ assessments:    2   (public alignment profiles)                 ║`,
  )
  console.log(
    `║  RAQ proposals:      3   (community question proposals)              ║`,
  )
  console.log(
    `║  RAQ axis votes:     3   (community axis support votes)              ║`,
  )
  console.log(
    `║  Lists:              5   (curated by community leaders)              ║`,
  )
  console.log(
    `║  Verifications:      8   (politicians, journalists, academics)       ║`,
  )
  console.log(
    `║  Checkpoints:        ${checkpoints.summary().checkpointCount.toString().padEnd(2)}  (named write/process phases completed)              ║`,
  )
  console.log(
    '╚══════════════════════════════════════════════════════════════════════╝',
  )
  console.log('')
  console.log(
    `Para demo checkpoints: ${JSON.stringify(checkpoints.summary(), null, 2)}`,
  )

  return {
    createdPosts,
    users: users.map((u) => ({
      short: u.short,
      did: u.did,
      name: u.name,
      party: u.party,
      agent: u.agent,
    })),
    alice,
  }
}
