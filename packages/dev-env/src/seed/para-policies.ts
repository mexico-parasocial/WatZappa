import { devPolicyVoteProof } from '../civic-verifier.js'

/*
 * Demo policies and the votes cast on them.
 *
 * Every policy carries an official policy flair (`||#`) and an official matter
 * flair (`|#`) from PARA's flair catalog, so each of the six matter groups
 * (Servicios Públicos, Hacienda, Economía, Asuntos Sociales, Asuntos
 * Exteriores, Interior) has policies to filter by.
 *
 * The votes are real public ballots written to each voter's own repo. They are
 * authorized by the dev-env m8 stand-in (civic-verifier.ts), whose proofs are
 * signed with a key that exists only in dev-env: nothing outside it accepts
 * them, so this fabricates no civic power anywhere real.
 */

export type SeedPolicy = {
  agent: string
  party: string
  title: string
  text: string
  postType: 'policy'
  bskyTags: string[]
  paraFlairs: string[]
  /** Which way the policy leans: -1 is conservative, +1 is progressive. */
  stance: number
  /** Share of the demo accounts that bother to vote, 0..1. */
  reach: number
}

export const EXTRA_POLICIES: SeedPolicy[] = [
  // ── 1. Servicios públicos ─────────────────────────────────────────────
  {
    agent: 'karla',
    party: 'Morena',
    title: 'Cheques escolares para familias de bajos ingresos',
    text: 'Un cheque anual por hijo en edad escolar, ligado a la asistencia y al ingreso del hogar. Cubre útiles, uniformes y transporte, y llega directo a la familia.',
    postType: 'policy',
    bskyTags: ['policy', 'educacion', 'familias'],
    paraFlairs: ['||#ChequesEscolares', '|#Educacion'],
    stance: 0.7,
    reach: 0.9,
  },
  {
    agent: 'nicolas',
    party: 'PAN',
    title: 'Hospitales con gestión mixta y metas de espera',
    text: 'Contratos de gestión con metas públicas: tiempo máximo de espera, abasto de medicamentos y satisfacción del paciente. Si un hospital no cumple, se cambia al operador.',
    postType: 'policy',
    bskyTags: ['policy', 'salud', 'hospitales'],
    paraFlairs: ['||#ServiciosPublicosDeSalud', '|#Sanidad'],
    stance: -0.5,
    reach: 0.8,
  },
  {
    agent: 'dan',
    party: 'PVEM',
    title: 'Carril exclusivo de autobús en avenidas principales',
    text: 'Convertir un carril por sentido en carril bus en las diez avenidas con más pasajeros. Menos tiempo de traslado para quien más lo necesita, y menos coches parados.',
    postType: 'policy',
    bskyTags: ['policy', 'movilidad', 'autobus'],
    paraFlairs: ['||#TransportePublico', '|#CarrilBus'],
    stance: 0.6,
    reach: 0.7,
  },
  {
    agent: 'luis',
    party: 'PT',
    title: 'Agua potable como servicio público municipal',
    text: 'Las concesiones de agua regresan al municipio cuando incumplan calidad o continuidad. Tarifa social garantizada para el consumo básico de cada hogar.',
    postType: 'policy',
    bskyTags: ['policy', 'agua', 'municipios'],
    paraFlairs: ['||#EmpresaPublicaDeAgua', '|#IndustriaHidrica'],
    stance: 0.8,
    reach: 0.85,
  },

  // ── 2. Hacienda ───────────────────────────────────────────────────────
  {
    agent: 'bob',
    party: 'PAN',
    title: 'Declaración fiscal precargada y simplificada',
    text: 'El SAT entrega la declaración anual ya llenada con la información que tiene. Quien esté de acuerdo la confirma en un clic; quien no, la corrige.',
    postType: 'policy',
    bskyTags: ['policy', 'impuestos', 'simplificacion'],
    paraFlairs: ['||#ImpuestoSobreLaRenta', '|#TransparenciaFiscal'],
    stance: -0.2,
    reach: 0.6,
  },
  {
    agent: 'rodrigo',
    party: 'PT',
    title: 'Impuesto a servicios digitales de grandes plataformas',
    text: 'Una tasa sobre los ingresos en México de las plataformas con más de mil millones de pesos de facturación, destinada a conectividad en escuelas rurales.',
    postType: 'policy',
    bskyTags: ['policy', 'impuestos', 'plataformas'],
    paraFlairs: ['||#ImpuestoSobreLasVentas', '|#ImpuestoAServiciosDigitales'],
    stance: 0.7,
    reach: 0.75,
  },
  {
    agent: 'carla',
    party: 'PRI',
    title: 'Impuesto saludable a bebidas azucaradas, con destino etiquetado',
    text: 'Mantener el impuesto a bebidas azucaradas y etiquetar lo recaudado a agua potable en escuelas y prevención de diabetes, con un informe anual público.',
    postType: 'policy',
    bskyTags: ['policy', 'salud', 'impuestos'],
    paraFlairs: ['||#ImpuestoALaComidaBasura', '|#ConsumoDeAzucar'],
    stance: 0.3,
    reach: 0.65,
  },
  {
    agent: 'tomas',
    party: 'Morena',
    title: 'Transparencia total del presupuesto municipal',
    text: 'Cada municipio publica en datos abiertos, cada mes, qué contrató, a quién y por cuánto. Sin portal abierto, no se liberan participaciones adicionales.',
    postType: 'policy',
    bskyTags: ['policy', 'transparencia', 'municipios'],
    paraFlairs: ['||#ImpuestoSobreBienesEInmuebles', '|#TransparenciaFiscal'],
    stance: 0.4,
    reach: 0.9,
  },

  // ── 3. Economía ───────────────────────────────────────────────────────
  {
    agent: 'hector',
    party: 'Independiente',
    title: 'Salario mínimo regional ligado a la inflación',
    text: 'El salario mínimo se actualiza cada año con la inflación de la canasta básica de cada región, y con un piso común para todo el país.',
    postType: 'policy',
    bskyTags: ['policy', 'salarios', 'inflacion'],
    paraFlairs: ['||#SalarioMinimo', '|#Salarios'],
    stance: 0.5,
    reach: 0.95,
  },
  {
    agent: 'fernando',
    party: 'MC',
    title: 'Semana laboral de cuatro días en prueba piloto',
    text: 'Programa voluntario para empresas medianas: cuatro días a salario completo, con medición pública de productividad, ausentismo y bienestar durante dos años.',
    postType: 'policy',
    bskyTags: ['policy', 'trabajo', 'productividad'],
    paraFlairs: ['||#LeyDePrevencionDeRiesgosLaborales', '|#SemanaLaboral'],
    stance: 0.5,
    reach: 0.8,
  },
  {
    agent: 'jorge',
    party: 'MC',
    title: 'Energías renovables en techos públicos',
    text: 'Paneles solares en escuelas, hospitales y oficinas de gobierno. El ahorro en la factura eléctrica se reinvierte en mantenimiento de los mismos edificios.',
    postType: 'policy',
    bskyTags: ['policy', 'energia', 'renovables'],
    paraFlairs: ['||#SubvencionDeEnergiasRenovables', '|#EficienciaEnergetica'],
    stance: 0.6,
    reach: 0.7,
  },
  {
    agent: 'pablo',
    party: 'Morena',
    title: 'Apoyo a la innovación tecnológica mexicana',
    text: 'Fondo para startups y laboratorios públicos que desarrollen tecnología en México, con la obligación de licenciar abiertamente lo financiado con dinero público.',
    postType: 'policy',
    bskyTags: ['policy', 'innovacion', 'tecnologia'],
    paraFlairs: ['||#AyudasALaInnovacion', '|#Tecnologia'],
    stance: 0.3,
    reach: 0.6,
  },

  // ── 4. Asuntos sociales ───────────────────────────────────────────────
  {
    agent: 'isabel',
    party: 'Independiente',
    title: 'Ingreso mínimo universal para jefas de familia',
    text: 'Un ingreso mensual garantizado a hogares encabezados por mujeres bajo la línea de pobreza, sin trámites que dependan de un intermediario.',
    postType: 'policy',
    bskyTags: ['policy', 'pobreza', 'mujeres'],
    paraFlairs: ['||#IngresoMinimoUniversal', '|#Pobreza'],
    stance: 0.8,
    reach: 0.85,
  },
  {
    agent: 'gabriela',
    party: 'Independiente',
    title: 'Regulación del alquiler en zonas de alta demanda',
    text: 'Topes a los aumentos anuales de renta en las colonias con mayor presión inmobiliaria, junto con incentivos para construir vivienda asequible.',
    postType: 'policy',
    bskyTags: ['policy', 'vivienda', 'renta'],
    paraFlairs: ['||#RegulacionDelAlquiler', '|#ViviendaPrivada'],
    stance: 0.5,
    reach: 0.75,
  },
  {
    agent: 'olivia',
    party: 'Independiente',
    title: 'Pensión no contributiva para personas con discapacidad',
    text: 'Una pensión universal para personas con discapacidad permanente, independiente de su historial laboral, ajustada cada año con la inflación.',
    postType: 'policy',
    bskyTags: ['policy', 'discapacidad', 'pensiones'],
    paraFlairs: ['||#PrestacionPorDiscapacidad', '|#DesarrolloHumano'],
    stance: 0.6,
    reach: 0.7,
  },
  {
    agent: 'alice',
    party: 'Morena',
    title: 'Cupones de comida para familias en inseguridad alimentaria',
    text: 'Un monedero electrónico para frutas, verduras y proteína en mercados y tianguis locales. Apoya al productor y no se puede gastar en otra cosa.',
    postType: 'policy',
    bskyTags: ['policy', 'alimentacion', 'mercados'],
    paraFlairs: ['||#ComedoresEscolaresGratuitos', '|#CuponesDeComida'],
    stance: 0.5,
    reach: 0.8,
  },

  // ── 5. Asuntos exteriores ─────────────────────────────────────────────
  {
    agent: 'quetzali',
    party: 'Independiente',
    title: 'Ventanilla única para solicitantes de asilo',
    text: 'Un solo trámite, con plazos públicos y acompañamiento legal gratuito, para quienes piden refugio en México. Sin que nadie espere meses en la frontera.',
    postType: 'policy',
    bskyTags: ['policy', 'migracion', 'asilo'],
    paraFlairs: ['||#AsiloDeRefugiados', '|#DemandaMigratoria'],
    stance: 0.7,
    reach: 0.6,
  },
  {
    agent: 'bob',
    party: 'PAN',
    title: 'Tratados de comercio con cláusulas laborales exigibles',
    text: 'Al negociar nuevos tratados, exigir estándares laborales y ambientales con mecanismos de queja que cualquier sindicato o ciudadano pueda activar.',
    postType: 'policy',
    bskyTags: ['policy', 'comercio', 'tratados'],
    paraFlairs: ['||#ReglasDeInmigracion', '|#ComercioInternacional'],
    stance: 0.1,
    reach: 0.55,
  },
  {
    agent: 'carla',
    party: 'PRI',
    title: 'Control fronterizo con tecnología y trato digno',
    text: 'Modernizar los cruces con revisión tecnológica para agilizar el paso legal, con protocolos de derechos humanos y supervisión independiente.',
    postType: 'policy',
    bskyTags: ['policy', 'frontera', 'seguridad'],
    paraFlairs: ['||#ControlesFronterizos', '|#Inmigración'],
    stance: -0.4,
    reach: 0.6,
  },
  {
    agent: 'sofia',
    party: 'Independiente',
    title: 'Ayuda exterior condicionada a resultados medibles',
    text: 'La cooperación internacional de México publica sus metas y resultados por proyecto. Lo que no se pueda medir, no se renueva.',
    postType: 'policy',
    bskyTags: ['policy', 'cooperacion', 'resultados'],
    paraFlairs: ['||#GastoMilitar', '|#AyudaExtranjera'],
    stance: -0.1,
    reach: 0.4,
  },

  // ── 6. Interior ───────────────────────────────────────────────────────
  {
    agent: 'eva',
    party: 'PT',
    title: 'Policía comunitaria con cuadrantes y rendición de cuentas',
    text: 'Policías asignados de forma estable a un barrio, que conocen a los vecinos y rinden cuentas en asambleas públicas cada trimestre.',
    postType: 'policy',
    bskyTags: ['policy', 'seguridad', 'comunidad'],
    paraFlairs: ['||#PoliciaComunitaria', '|#Delincuencia'],
    stance: 0.3,
    reach: 0.85,
  },
  {
    agent: 'nicolas',
    party: 'PAN',
    title: 'Cámaras corporales obligatorias para la policía',
    text: 'Todo policía en servicio porta cámara corporal, con grabaciones accesibles a la víctima, al acusado y a un órgano de control independiente.',
    postType: 'policy',
    bskyTags: ['policy', 'policia', 'derechos'],
    paraFlairs: ['||#CamarasCorporales', '|#DelitosConViolencia'],
    stance: 0.1,
    reach: 0.7,
  },
  {
    agent: 'mariana',
    party: 'Independiente',
    title: 'Sistema anticorrupción con fiscal independiente',
    text: 'Un fiscal anticorrupción con presupuesto blindado, designado por concurso público y sin posibilidad de remoción sin causa grave y debate abierto.',
    postType: 'policy',
    bskyTags: ['policy', 'corrupcion', 'fiscalia'],
    paraFlairs: ['||#LimiteDeMandatos', '|#Corrupción'],
    stance: 0.2,
    reach: 0.95,
  },
  {
    agent: 'tomas',
    party: 'Morena',
    title: 'Regulación del cabildeo con registro público de reuniones',
    text: 'Toda reunión entre un funcionario y un cabildero queda registrada y publicada en 48 horas, con el tema y los documentos entregados.',
    postType: 'policy',
    bskyTags: ['policy', 'cabildeo', 'transparencia'],
    paraFlairs: ['||#RestringirPublicidadElectoral', '|#LimitarDonacionesEmpresariales'],
    stance: 0.3,
    reach: 0.8,
  },
]

/**
 * How far each party sits from the policy's lean, as a multiplier on its
 * stance. Positive parties lean with a progressive policy, negative ones
 * against it; independents land near the middle and vary person to person.
 */
export const PARTY_LEAN: Record<string, number> = {
  Morena: 0.9,
  PT: 1,
  MC: 0.35,
  PVEM: 0.45,
  PRI: -0.1,
  PAN: -0.8,
  Independiente: 0.15,
}

/** Stance of the older demo policies, by their second tag. */
export const LEGACY_POLICY_STANCE: Record<string, { stance: number; reach: number }> =
  {
    energia: { stance: 0.5, reach: 0.8 },
    movilidad: { stance: 0.6, reach: 0.75 },
    anticorrupcion: { stance: 0.3, reach: 0.9 },
    tren: { stance: 0.2, reach: 0.7 },
    elecciones: { stance: 0.4, reach: 0.65 },
    clima: { stance: 0.8, reach: 0.8 },
    biodiversidad: { stance: 0.7, reach: 0.55 },
    presupuesto: { stance: 0.5, reach: 0.7 },
    transparencia: { stance: 0.4, reach: 0.85 },
    transicion: { stance: 0.6, reach: 0.6 },
    datos: { stance: 0.4, reach: 0.5 },
    fiscalia: { stance: 0.3, reach: 0.85 },
    paridad: { stance: 0.9, reach: 0.9 },
    aborto: { stance: 0.9, reach: 0.95 },
    arte: { stance: 0.7, reach: 0.6 },
  }

/** A small stable hash in [0, 1), so a seed run always casts the same votes. */
export const stableUnit = (...parts: string[]) => {
  let h = 2166136261
  for (const ch of parts.join('\u0000')) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

export type PolicyVotePlan = {
  voter: string
  policy: number
  signal: number
}

/**
 * Who votes on which policy and how. A voter turns up with probability
 * `reach`; their signal is the policy's stance scaled by their party's lean,
 * nudged by up to a point either way so no party votes in lockstep.
 */
export const planPolicyVotes = (
  voters: { short: string; party: string }[],
  policies: { stance: number; reach: number; key: string }[],
): PolicyVotePlan[] => {
  const plan: PolicyVotePlan[] = []
  policies.forEach((policy, index) => {
    for (const voter of voters) {
      if (stableUnit('turnout', voter.short, policy.key) > policy.reach) continue
      const lean = PARTY_LEAN[voter.party] ?? 0
      const nudge = Math.round(
        (stableUnit('nudge', voter.short, policy.key) - 0.5) * 2,
      )
      const personal =
        voter.party === 'Independiente'
          ? (stableUnit('self', voter.short) - 0.5) * 2
          : 0
      const signal = Math.max(
        -3,
        Math.min(3, Math.round((policy.stance * lean + personal * 0.5) * 4) + nudge),
      )
      plan.push({ voter: voter.short, policy: index, signal })
    }
  })
  return plan
}

type VoteAgent = {
  com: {
    atproto: {
      repo: {
        createRecord: (input: {
          repo: string
          collection: string
          record: Record<string, unknown>
        }) => Promise<unknown>
      }
    }
  }
}

/**
 * Writes the planned ballots. Returns how many the PDS accepted; a refusal
 * (for example a real m8 verifier that does not know the dev proofs) is
 * counted rather than thrown, so a seed run still finishes.
 */
export const castPolicyVotes = async (
  plan: PolicyVotePlan[],
  voters: Map<string, { did: string; agent: VoteAgent }>,
  policyUris: string[],
) => {
  let cast = 0
  let refused = 0
  for (const { voter, policy, signal } of plan) {
    const account = voters.get(voter)
    const uri = policyUris[policy]
    if (!account || !uri) continue
    try {
      await account.agent.com.atproto.repo.createRecord({
        repo: account.did,
        collection: 'com.para.civic.vote',
        record: {
          $type: 'com.para.civic.vote',
          subject: uri,
          subjectType: 'policy',
          signal,
          isDirect: true,
          ...devPolicyVoteProof(account.did, uri, signal),
          createdAt: new Date().toISOString(),
        },
      })
      cast += 1
    } catch {
      refused += 1
    }
  }
  return { cast, refused }
}
