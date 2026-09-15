import type {
  ActorDb,
  ParaSpacePolicyDelta,
  ParaSpacePolicyFault,
  ParaSpacePolicyState,
  Space,
} from '../db/index.js'
import type {
  ParaPolicyMember,
  ParaPolicyMembershipState,
  ParaPolicyRoleAssignment,
} from './types.js'

export class ParaPolicyReader {
  constructor(public readonly db: ActorDb) {}

  /** Read from the authority actor store inside the transaction that authorizes the operation. */
  async getPolicyInput(space: string, did: string): Promise<ParaPolicyInput> {
    this.db.assertTransaction()
    const spaceRow = await this.db.db
      .selectFrom('space')
      .selectAll()
      .where('uri', '=', space)
      .executeTakeFirst()
    const state = await this.getPolicyState(space)
    const member = await this.getPolicyMember(space, did)
    return { space: spaceRow ?? null, state, member }
  }

  async getPolicyState(space: string): Promise<ParaSpacePolicyState | null> {
    const row = await this.db.db
      .selectFrom('para_space_policy_state')
      .selectAll()
      .where('space', '=', space)
      .executeTakeFirst()
    return row ?? null
  }

  /** Durable verified high-water marks, not authorization input or an accepted checkpoint. */
  async getPolicyFault(space: string): Promise<ParaSpacePolicyFault | null> {
    return (
      (await this.db.db
        .selectFrom('para_space_policy_fault')
        .selectAll()
        .where('space', '=', space)
        .executeTakeFirst()) ?? null
    )
  }

  async getPolicyMember(
    space: string,
    did: string,
  ): Promise<ParaPolicyMember | null> {
    const row = await this.db.db
      .selectFrom('para_space_policy_member')
      .selectAll()
      .where('space', '=', space)
      .where('did', '=', did)
      .executeTakeFirst()
    return row ? parseMember(row) : null
  }

  async getPolicyDelta(
    space: string,
    sourceVersion: number,
  ): Promise<ParaSpacePolicyDelta | null> {
    const row = await this.db.db
      .selectFrom('para_space_policy_delta')
      .selectAll()
      .where('space', '=', space)
      .where('sourceVersion', '=', sourceVersion)
      .executeTakeFirst()
    return row ?? null
  }

  async listPolicyMembers(space: string): Promise<ParaPolicyMember[]> {
    const rows = await this.db.db
      .selectFrom('para_space_policy_member')
      .selectAll()
      .where('space', '=', space)
      .orderBy('did', 'asc')
      .execute()
    return rows.map(parseMember)
  }
}

export type ParaPolicyInput = {
  space: Space | null
  state: ParaSpacePolicyState | null
  member: ParaPolicyMember | null
}

const parseMember = (row: {
  space: string
  did: string
  membershipState: string
  roles: string
  roleAssignments: string
  sourceVersion: number
  updatedAt: string
}): ParaPolicyMember => ({
  ...row,
  membershipState: parseMembershipState(row.membershipState),
  roles: parseArray<string>(row.roles, 'roles'),
  roleAssignments: parseArray<ParaPolicyRoleAssignment>(
    row.roleAssignments,
    'role assignments',
  ),
})

const parseMembershipState = (value: string): ParaPolicyMembershipState => {
  if (
    value === 'pending' ||
    value === 'active' ||
    value === 'left' ||
    value === 'removed' ||
    value === 'blocked'
  ) {
    return value
  }
  throw new Error(`Invalid PARA membership state in actor store: ${value}`)
}

const parseArray = <T>(value: string, field: string): T[] => {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid PARA policy ${field} in actor store`)
  }
  return parsed as T[]
}
