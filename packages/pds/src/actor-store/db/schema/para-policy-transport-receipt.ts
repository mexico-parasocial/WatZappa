/** Single-use transport request identifiers, retained through envelope expiry. */
export interface ParaPolicyTransportReceipt {
  issuer: string
  jtiHash: string
  consumedAt: string
  retainUntil: string
}

const tableName = 'para_policy_transport_receipt'

export type PartialDB = { [tableName]: ParaPolicyTransportReceipt }
