export type M8Session = {
  did: string
  sessionId?: string
}

export async function validateIm8Token(
  m8BaseUrl: string,
  token: string,
): Promise<M8Session> {
  const url = `${m8BaseUrl.replace(/\/$/, '')}/sessions/me`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Invalid M8 token')
  }
  const body = (await response.json()) as {
    session?: { did?: string; sessionId?: string }
  }
  const did = body.session?.did
  if (!did) {
    throw new Error('M8 session did not include a DID')
  }
  return { did, sessionId: body.session?.sessionId }
}
