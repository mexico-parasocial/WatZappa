import * as init from './001-init.js'
import * as space from './002-space.js'
import * as spaceAccess from './003-space-access.js'
import * as paraPolicy from './900-para-policy.js'
import * as paraPolicyFault from './901-para-policy-fault.js'
import * as paraPolicyCheckpoint from './902-para-policy-checkpoint.js'

// Keys 001-899 are reserved for upstream's sequence so a future upstream
// actor-store migration can be adopted at its own number without colliding
// with ours. PARA migrations live at 900+ with descriptive keys; they touch
// only para_space_policy_* tables, so running after upstream's is safe.
export default {
  '001': init,
  '002': space,
  '003': spaceAccess,
  '900-para-policy': paraPolicy,
  '901-para-policy-fault': paraPolicyFault,
  '902-para-policy-checkpoint': paraPolicyCheckpoint,
}
