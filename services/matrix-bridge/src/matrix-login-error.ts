export class MatrixLoginUnavailableError extends Error {
  name = 'MatrixLoginUnavailableError'

  constructor() {
    super(
      'Device-bound application service login is unavailable; use the homeserver client authorization flow',
    )
  }
}
