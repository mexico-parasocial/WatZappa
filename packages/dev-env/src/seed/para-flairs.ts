import { SeedClient } from './client.js'

export default async (sc: SeedClient) => {
  const createdAt = () => new Date().toISOString()
  const login = async (identifier: string, password: string) => {
    const agent = sc.network.pds.getAgent()
    await agent.login({ identifier, password })
    return agent
  }

  const alice = await login('alice.test', 'hunter2')
  const bob = await login('bob.test', 'hunter2')
  const carla = await login('carla.test', 'hunter2')

  const mirrorToBsky = async (
    agent: Awaited<ReturnType<typeof login>>,
    text: string,
  ) => {
    await agent.app.bsky.feed.post.create(
      { repo: agent.assertDid },
      { text, createdAt: createdAt() },
    )
  }

  // ALICE: Water Rights & Industrial Balance (Matter & Open Question)
  const aliceText1 =
    'Es fundamental garantizar el acceso al agua como derecho humano. La propuesta de crear una empresa pública de agua debe ir acompañada de un plan hídrico integral para la región.'
  const aliceTags1 = '||#EmpresaPublicaDeAgua |#IndustriaHidrica'

  await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      title: 'Creación de Empresa Pública de Agua',
      text: aliceText1,
      createdAt: createdAt(),
      postType: 'policy',
      tags: ['agua', 'derechos', 'infraestructura'],
      flairs: ['||#EmpresaPublicaDeAgua', '|#IndustriaHidrica'],
    },
  })
  await mirrorToBsky(alice, `${aliceText1} ${aliceTags1}`)

  const aliceText2 =
    '¿Cómo equilibramos el desarrollo industrial con la protección de nuestros mantos acuíferos en la zona metropolitana? El debate está abierto en la asamblea de hoy.'
  const aliceTags2 = '|#IndustriaHidrica |#?OpenQuestion'

  await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      text: aliceText2,
      createdAt: createdAt(),
      postType: 'open_question',
      tags: ['debate', 'agua', 'industria'],
      flairs: ['|#IndustriaHidrica', '|#?OpenQuestion'],
    },
  })
  await mirrorToBsky(alice, `${aliceText2} ${aliceTags2}`)

  // BOB: Public Transit & Clarifications (Policy & RAQ)
  const bobText1 =
    'Se requiere ampliar la red de transporte público conectando la periferia con los centros de trabajo. Es una inversión prioritaria para reducir la desigualdad urbana y mejorar los tiempos de traslado.'
  const bobTags1 = '||#TransportePublico |#SubvencionesDeViajesEnBus'

  const bobPost = await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      title: 'Ampliación de la Red de Transporte Público',
      text: bobText1,
      createdAt: createdAt(),
      postType: 'policy',
      tags: ['movilidad', 'transporte', 'ciudad'],
      flairs: ['||#TransportePublico', '|#SubvencionesDeViajesEnBus'],
    },
  })
  await mirrorToBsky(bob, `${bobText1} ${bobTags1}`)

  const bobUri = bobPost.data.uri
  const bobRkey = bobUri.split('/').pop()
  if (bobRkey) {
    await bob.com.atproto.repo.createRecord({
      repo: bob.assertDid,
      collection: 'com.para.social.postMeta',
      rkey: bobRkey,
      record: {
        $type: 'com.para.social.postMeta',
        post: bobUri,
        postType: 'policy',
        party: 'p/PAN',
        community: 'p/CDMX',
        flairs: ['||#TransportePublico', '|#SubvencionesDeViajesEnBus'],
        voteScore: 84,
        createdAt: createdAt(),
      },
    })
  }

  const bobText2 =
    'Para aclarar la votación de la asamblea de ayer respecto al dictamen: El subsidio al transporte se mantendrá sin cambios para estudiantes y adultos mayores; la reforma solo ajusta las tarifas generales.'
  const bobTags2 = '||#TransportePublico |#!RAQ'

  await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      text: bobText2,
      createdAt: createdAt(),
      postType: 'raq',
      tags: ['aclaracion', 'subsidios', 'transporte'],
      flairs: ['||#TransportePublico', '|#!RAQ'],
    },
  })
  await mirrorToBsky(bob, `${bobText2} ${bobTags2}`)

  // CARLA: Education & Meta Coordination (Matter & Meta)
  const carlaText1 =
    'Necesitamos modernizar nuestras escuelas públicas con mejor infraestructura en la región escolar. La educación equitativa y científica es la base del futuro para nuestra comunidad.'
  const carlaTags1 = '||#EscuelasPublicas ||#EducacionLaica'

  await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      title: 'Modernización de Escuelas Públicas',
      text: carlaText1,
      createdAt: createdAt(),
      postType: 'policy',
      tags: ['educacion', 'escuelas', 'presupuesto'],
      flairs: ['||#EscuelasPublicas', '||#EducacionLaica'],
    },
  })
  await mirrorToBsky(carla, `${carlaText1} ${carlaTags1}`)

  const carlaText2 =
    'Recordatorio para los vocales de la mesa directiva: por favor revisen el borrador técnico sobre los comedores escolares antes de la sesión de votación de este viernes a mediodía.'
  const carlaTags2 = '||#ComedoresEscolaresGratuitos #META'

  await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      text: carlaText2,
      createdAt: createdAt(),
      postType: 'meta',
      tags: ['anuncio', 'asamblea', 'comite'],
      flairs: ['||#ComedoresEscolaresGratuitos', '#META'],
    },
  })
  await mirrorToBsky(carla, `${carlaText2} ${carlaTags2}`)

  // CARLA: Renewable Energy (Policy & Matter)
  const carlaText3 =
    'La instalación de paneles solares en parques públicos no solo reducirá costos de energía, sino que servirá como centro de carga para la comunidad. ¡Energía limpia para todos!'
  const carlaTags3 = '||#EnergiaSolar ||#ParquesPublicos'

  const carlaPost3 = await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      title: 'Instalación de Paneles Solares en Parques',
      text: carlaText3,
      createdAt: createdAt(),
      postType: 'policy',
      tags: ['energia', 'sustentabilidad', 'innovacion'],
      flairs: ['||#EnergiaSolar', '||#ParquesPublicos'],
    },
  })
  await mirrorToBsky(carla, `${carlaText3} ${carlaTags3}`)

  const carlaUri3 = carlaPost3.data.uri
  const carlaRkey3 = carlaUri3.split('/').pop()
  if (carlaRkey3) {
    await carla.com.atproto.repo.createRecord({
      repo: carla.assertDid,
      collection: 'com.para.social.postMeta',
      rkey: carlaRkey3,
      record: {
        $type: 'com.para.social.postMeta',
        post: carlaUri3,
        postType: 'policy',
        official: true,
        party: 'p/VERDE',
        community: 'p/MEXICO',
        voteScore: 92,
        createdAt: createdAt(),
      },
    })
  }

  // BOB: Urban Planning meme
  const bobText3 =
    'Yo intentando explicar por qué necesitamos carriles bici protegidos en una avenida de 10 carriles... 🤡🚲'
  const bobTags3 = '|#MovilidadActiva #MEME'

  const bobPost3 = await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      text: bobText3,
      createdAt: createdAt(),
      postType: 'meme',
      tags: ['ciclismo', 'urbanismo', 'humor'],
      flairs: ['|#MovilidadActiva', '#MEME'],
    },
  })
  await mirrorToBsky(bob, `${bobText3} ${bobTags3}`)

  const bobUri3 = bobPost3.data.uri
  const bobRkey3 = bobUri3.split('/').pop()
  if (bobRkey3) {
    await bob.com.atproto.repo.createRecord({
      repo: bob.assertDid,
      collection: 'com.para.social.postMeta',
      rkey: bobRkey3,
      record: {
        $type: 'com.para.social.postMeta',
        post: bobUri3,
        postType: 'meme',
        official: false,
        voteScore: 45,
        createdAt: createdAt(),
      },
    })
  }

  // ALICE: Matter
  const aliceText3 =
    'Propuesta técnica: Implementación de techos verdes en edificios gubernamentales para mitigar el efecto de isla de calor urbana. Adjunto el borrador de la norma.'
  const aliceTags3 = '||#TechosVerdes |#RespetoAmbiental'

  const alicePost3 = await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.post',
    record: {
      $type: 'com.para.post',
      text: aliceText3,
      createdAt: createdAt(),
      postType: 'matter',
      tags: ['ambiente', 'arquitectura', 'normativa'],
      flairs: ['||#TechosVerdes', '|#RespetoAmbiental'],
    },
  })
  await mirrorToBsky(alice, `${aliceText3} ${aliceTags3}`)

  const aliceUri3 = alicePost3.data.uri
  const aliceRkey3 = aliceUri3.split('/').pop()
  if (aliceRkey3) {
    await alice.com.atproto.repo.createRecord({
      repo: alice.assertDid,
      collection: 'com.para.social.postMeta',
      rkey: aliceRkey3,
      record: {
        $type: 'com.para.social.postMeta',
        post: aliceUri3,
        postType: 'matter',
        official: true,
        party: 'p/MORENA',
        voteScore: 78,
        createdAt: createdAt(),
      },
    })
  }

  await sc.network.processAll()
}
