import { Counter, Gauge, Histogram, Registry } from 'prom-client'

export class BridgeMetrics {
  readonly registry = new Registry()

  readonly invitesTotal = new Counter({
    name: 'para_matrix_invites_total',
    help: 'Total number of Matrix invites issued',
    labelNames: ['community_uri', 'status'],
    registers: [this.registry],
  })

  readonly kicksTotal = new Counter({
    name: 'para_matrix_kicks_total',
    help: 'Total number of Matrix kicks issued',
    labelNames: ['community_uri', 'status'],
    registers: [this.registry],
  })

  readonly spacesCreatedTotal = new Counter({
    name: 'para_matrix_spaces_created_total',
    help: 'Total number of Matrix spaces created for communities',
    labelNames: ['status'],
    registers: [this.registry],
  })

  readonly syncLatency = new Histogram({
    name: 'para_matrix_sync_latency_seconds',
    help: 'Time to process a firehose event and sync to Matrix',
    labelNames: ['event_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  })

  readonly firehoseLag = new Gauge({
    name: 'para_matrix_firehose_lag_seconds',
    help: 'Lag between firehose event time and processing time',
    registers: [this.registry],
  })

  readonly retryAttemptsTotal = new Counter({
    name: 'para_matrix_retry_attempts_total',
    help: 'Total number of retry attempts for failed syncs',
    labelNames: ['event_type', 'status'],
    registers: [this.registry],
  })

  readonly activeUsers = new Gauge({
    name: 'para_matrix_active_users',
    help: 'Number of users with Matrix accounts provisioned',
    registers: [this.registry],
  })

  readonly activeSpaces = new Gauge({
    name: 'para_matrix_active_spaces',
    help: 'Number of community spaces mapped to Matrix',
    registers: [this.registry],
  })

  readonly sortitionDrandTotal = new Counter({
    name: 'para_sortition_drand_total',
    help: 'Total number of chamber assignments using drand',
    registers: [this.registry],
  })

  readonly sortitionFallbackTotal = new Counter({
    name: 'para_sortition_fallback_total',
    help: 'Total number of chamber assignments using deterministic fallback',
    registers: [this.registry],
  })

  readonly drandLatency = new Histogram({
    name: 'para_drand_latency_seconds',
    help: 'Time to fetch a beacon from drand',
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  })
}
