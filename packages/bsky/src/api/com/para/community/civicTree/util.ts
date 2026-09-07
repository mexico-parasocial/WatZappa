import { Code, ConnectError } from '@connectrpc/connect'
import { InvalidRequestError } from '@atproto/xrpc-server'

/*
 * The data plane speaks Connect; XRPC clients speak HTTP status codes. The
 * expected denials (not a member, self-vote, missing rows) would otherwise
 * surface as opaque 500s, so map the 4xx-class Connect codes onto
 * InvalidRequestError and keep their message.
 */
const CLIENT_ERROR_CODES = new Set([
  Code.InvalidArgument,
  Code.NotFound,
  Code.PermissionDenied,
  Code.FailedPrecondition,
])

export const forwardDataplaneErrors = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn()
  } catch (err) {
    if (
      err instanceof ConnectError &&
      CLIENT_ERROR_CODES.has(err.code) &&
      err.message
    ) {
      throw new InvalidRequestError(err.message)
    }
    throw err
  }
}

export const parseDataplaneJson = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
