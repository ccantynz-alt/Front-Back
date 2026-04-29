# Crontech Bare Metal Stack

This is the definitive architecture reference for the Crontech self-hosted infrastructure platform.

## Hardware

**Vultr Bare Metal** — dedicated hardware, no noisy neighbours, no hypervisor overhead.

- Recommended tier: Bare Metal High Frequency (Intel Xeon, 32 cores, 256GB RAM, 2x NVMe SSD)
- Network: 10Gbps uplink, dedicated IP range
- Locations: Primary + disaster-recovery replica in a second region

## OS and Runtime

- **OS:** Ubuntu 24.04 LTS (minimal install, no desktop)
- **Runtime:** Bun v1.x for all TypeScript/JavaScript services (3x faster than Node for I/O-bound workloads)
- **Process management:** Woodpecker CI for builds, Docker Compose for service lifecycle
- **Reverse proxy:** Caddy 2.x (automatic HTTPS, HTTP/3, zero-config TLS via ACME)

## Database

**PostgreSQL 16** on bare metal NVMe.

Stores:
- Job queue (cron jobs, retry state, execution history)
- Deployment state (deploys, rollback history, health check logs)
- Email queue (outbound queue, delivery status, bounce log)
- User accounts, API keys, billing data
- DNS zone records
- Flywheel telemetry events (last 30 days hot, then archived)

Config:
- `shared_buffers = 64GB` (25% of RAM)
- `effective_cache_size = 192GB`
- `work_mem = 512MB`
- `wal_compression = on`
- Streaming replication to DR replica

## Monitoring

- **Metrics:** Prometheus + Grafana (self-hosted on same cluster)
- **Logs:** Loki + Grafana (structured JSON logs from all services)
- **Alerting:** Grafana alerts -> Crontech email service -> ops team
- **Uptime:** Self-hosted Uptime Kuma for external endpoint monitoring

## AI Flywheel Data Pipeline

```
Service emits event
  -> PostgreSQL flywheel_events table (hot store, 30 days)
  -> Hourly batch job reads events, calls Claude API for analysis
  -> Analysis results written to flywheel_insights table
  -> Services read insights at startup and on config refresh
  -> Insights feed back into service behaviour (adjusted thresholds, optimized schedules, etc.)
```

Models used:
- `claude-haiku-4-5`: real-time per-event triage (< 200ms budget)
- `claude-sonnet-4-6`: hourly batch analysis and capacity planning

## Network Topology

- All services communicate over internal Docker network (`crontech-internal`)
- Caddy is the ONLY public-facing process (ports 80, 443)
- Inter-service calls use service names (`http://crontech-email:3001`) not localhost
- Woodpecker CI runner has outbound internet access for builds; all other services do not

## Deployment Flow

1. Dev pushes to Gluecron repo
2. Gluecron fires deploy webhook to `POST /api/v1/deploy`
3. Crontech deploy service pulls image, runs GateTest gate check
4. If gate passes: rolling update with health check validation
5. If gate fails: deploy blocked, notification sent, previous version stays live
6. Deploy event emitted to AI flywheel for outcome tracking

## Backup Strategy

- PostgreSQL: continuous WAL archiving to object storage + daily `pg_dump` snapshot
- Object storage: cross-region replication for buckets tagged `replicate=true`
- Retention: 30 days daily snapshots, 12 months monthly snapshots
- Recovery time objective (RTO): < 30 minutes
- Recovery point objective (RPO): < 5 minutes
