import { createHash } from 'node:crypto'

/*
 * Demo community activities, their ledgers and wiki pages, so the local
 * activity explorer and community Menu tab are not empty. Each community's
 * creator (its owner) publishes them, which is what the AppView requires to
 * serve them.
 */

type SeedUser = {
  did: string
  agent: {
    com: {
      atproto: {
        repo: {
          createRecord: (input: {
            repo: string
            collection: string
            record: Record<string, unknown>
          }) => Promise<{ data: { uri: string; cid: string } }>
        }
      }
    }
  }
}

type SeedCommunity = { uri: string; name: string; creatorDid: string }

const DAY = 24 * 60 * 60 * 1000
const at = (days: number, hour = 10) => {
  const date = new Date(Date.now() + days * DAY)
  date.setUTCHours(hour + 6, 0, 0, 0) // local Mexico City time
  return date.toISOString()
}

const SOCIAL = 'com.para.community.socialActivity'
const ECONOMIC = 'com.para.community.economicActivity'
const LEDGER = 'com.para.community.activityLedgerEntry'
const WIKI = 'com.para.community.wikiPage'

// Mirrors PARA's computeTermsDigest (src/lib/community-activities.ts), so the
// seeded ledger entries match their activity's committed terms.
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v !== undefined) acc[key] = canonicalize(v)
        return acc
      }, {})
  }
  return value
}
const termsDigest = (
  financialPlan: Record<string, unknown>,
  details: Record<string, unknown>,
) => {
  const { winningTickets: _drawn, ...terms } = details
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ plan: financialPlan, details: terms })))
    .digest('hex')
}

export async function seedCommunityActivities({
  users,
  communities,
}: {
  users: SeedUser[]
  communities: SeedCommunity[]
}) {
  const [first, second] = communities
  if (!first || !second) return
  const ownerOf = (community: SeedCommunity) =>
    users.find((u) => u.did === community.creatorDid)
  const firstOwner = ownerOf(first)
  const secondOwner = ownerOf(second)
  if (!firstOwner || !secondOwner) return

  const write = async (
    by: SeedUser,
    collection: string,
    record: Record<string, unknown>,
  ) => {
    const now = new Date().toISOString()
    const { data } = await by.agent.com.atproto.repo.createRecord({
      repo: by.did,
      collection,
      record: {
        $type: collection,
        createdBy: by.did,
        createdAt: now,
        updatedAt: now,
        ...record,
      },
    })
    return data.uri
  }

  // ── Social: a march and a signature drive ──────────────────────────────
  await write(firstOwner, SOCIAL, {
    communityUri: first.uri,
    title: 'Marcha pacífica por el agua limpia',
    description:
      'Caminata familiar para exigir el saneamiento del río y la publicación de los estudios de calidad del agua.',
    startsAt: at(9),
    endsAt: at(9, 13),
    location: 'Monumento a la Revolución, CDMX',
    status: 'planned',
    details: {
      $type: `${SOCIAL}#peacefulMarch`,
      meetingPoint: 'Monumento a la Revolución',
      route: 'Av. Juárez → Madero → Zócalo',
      destination: 'Zócalo',
      permitStatus: 'requested',
      expectedAttendance: 400,
      accessibilityNotes: 'Ruta plana; habrá puntos de hidratación cada kilómetro.',
    },
  })
  await write(firstOwner, SOCIAL, {
    communityUri: first.uri,
    title: 'Recolección de firmas: iniciativa de presupuesto abierto',
    description:
      'Reunimos firmas para presentar una iniciativa ciudadana que obligue a publicar el presupuesto municipal en datos abiertos.',
    startsAt: at(-5),
    endsAt: at(25, 18),
    status: 'active',
    details: {
      $type: `${SOCIAL}#signatureDrive`,
      instrumentType: 'citizen_initiative',
      instrumentTitle: 'Iniciativa de Presupuesto Abierto Municipal',
      targetSignatures: 5000,
      signaturesCollected: 1240,
      deadline: at(25, 18),
      collectionPoints: ['Mercado de Coyoacán (sábados)', 'Biblioteca central'],
      signerRequirements: 'Credencial para votar vigente del municipio.',
    },
  })

  // ── Economic: a settled raffle with its ledger, and an upcoming sale ───
  const rafflePlan = {
    currency: 'MXN',
    allocationBase: 'net_proceeds',
    fundingGoalMinor: 3_000_000,
    expenseBudgetMinor: 600_000,
    allocations: [
      { recipient: 'community', label: 'Fondo de la comunidad', shareBps: 7000 },
      { recipient: 'cause', label: 'Comedor comunitario', shareBps: 3000 },
    ],
    committedAt: at(-40),
  }
  const raffleDetails = {
    $type: `${ECONOMIC}#raffle`,
    ticketPriceMinor: 5_000,
    ticketsAvailable: 800,
    prizes: [
      { description: 'Bicicleta urbana', estimatedValueMinor: 650_000 },
      { description: 'Canasta de productos locales', estimatedValueMinor: 150_000 },
    ],
    drawAt: at(-8, 18),
    drawMethod: 'Sorteo público transmitido en vivo',
    permitReference: 'SEGOB/DGJS/2026/0142',
    winningTickets: ['0417', '0062'],
  }
  const raffle = await write(secondOwner, ECONOMIC, {
    communityUri: second.uri,
    title: 'Rifa para el comedor comunitario',
    description: 'Boletos a $50; lo recaudado se reparte según el plan publicado.',
    startsAt: at(-30),
    endsAt: at(-8, 20),
    status: 'completed',
    details: raffleDetails,
    financialPlan: rafflePlan,
  })
  const digest = termsDigest(rafflePlan, raffleDetails)
  const ledger = [
    {
      entryType: 'income',
      amountMinor: 3_100_000,
      quantity: 620,
      category: 'tickets',
      description: '620 boletos vendidos',
      occurredAt: at(-9),
    },
    {
      entryType: 'expense',
      amountMinor: 650_000,
      category: 'prizes',
      description: 'Compra de la bicicleta',
      occurredAt: at(-25),
    },
    {
      entryType: 'expense',
      amountMinor: 120_000,
      category: 'materials',
      description: 'Impresión de boletos y carteles',
      occurredAt: at(-28),
    },
    {
      entryType: 'donation',
      amountMinor: 1_631_000,
      recipient: 'community',
      description: 'Depósito al fondo de la comunidad',
      occurredAt: at(-6),
    },
    {
      entryType: 'donation',
      amountMinor: 699_000,
      recipient: 'cause',
      description: 'Entrega al comedor comunitario',
      occurredAt: at(-6),
    },
  ]
  for (const entry of ledger) {
    await write(secondOwner, LEDGER, {
      activityUri: raffle,
      communityUri: second.uri,
      termsDigest: digest,
      currency: 'MXN',
      ...entry,
    })
  }

  await write(secondOwner, ECONOMIC, {
    communityUri: second.uri,
    title: 'Venta de tamales para la brigada de salud',
    startsAt: at(14, 8),
    endsAt: at(14, 14),
    location: 'Explanada de la parroquia',
    status: 'planned',
    details: {
      $type: `${ECONOMIC}#sale`,
      channel: 'in_person',
      items: [
        { name: 'Tamal verde', unitPriceMinor: 2_500, quantityAvailable: 300 },
        { name: 'Atole', unitPriceMinor: 2_000, quantityAvailable: 150 },
      ],
    },
    financialPlan: {
      currency: 'MXN',
      allocationBase: 'net_proceeds',
      expenseBudgetMinor: 400_000,
      allocations: [
        { recipient: 'cause', label: 'Brigada de salud', shareBps: 9000 },
        { recipient: 'reinvestment', label: 'Insumos de la próxima venta', shareBps: 1000 },
      ],
      committedAt: at(-2),
    },
  })

  // ── Wiki: an about page and a pinned megathread ────────────────────────
  await write(firstOwner, WIKI, {
    communityUri: first.uri,
    kind: 'page',
    slug: 'acerca-de',
    title: 'Acerca de la comunidad',
    body: `# ${first.name}\n\nEspacio para coordinar acciones ciudadanas.\n\n- [[reglas]] de convivencia\n- Próximas actividades en la pestaña **Menú**`,
  })
  await write(firstOwner, WIKI, {
    communityUri: first.uri,
    kind: 'megathread',
    slug: 'marcha-agua',
    title: 'Megahilo: organización de la marcha',
    body: 'Dudas, transporte compartido y voluntariado para la marcha.',
    pinned: true,
  })
}
