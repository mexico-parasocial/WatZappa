export interface RevokedSpaceCredential {
  space: string
  jti: string
  expiresAt: string
}

export type PartialDB = {
  revoked_space_credential: RevokedSpaceCredential
}
