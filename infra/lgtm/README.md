# Crontech LGTM observability stack (BLK-014)

Grafana + Loki + Tempo + Mimir + OTel Collector, all single-binary, all
Dockerised. Spins up in one command for the dev / single-box footprint.

## Bring it up

```bash
docker compose -f infra/lgtm/docker-compose.yml up -d
```

That starts:

| Service          | Port (localhost) | Purpose                                         |
| ---------------- | ---------------- | ----------------------------------------------- |
| `otel-collector` | 4317 (gRPC)      | OTLP receiver for app telemetry                 |
| `otel-collector` | 4318 (HTTP)      | OTLP receiver for app telemetry                 |
| `loki`           | 3100             | Logs backend                                    |
| `tempo`          | 3200             | Traces backend                                  |
| `mimir`          | 9009             | Metrics backend (Prometheus-compatible)         |
| `grafana`        | 3000             | Dashboards (admin/admin default)                |

## Point your app at it

The OTel SDK reads `OTEL_EXPORTER_OTLP_ENDPOINT`. Set it to the collector:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=crontech-api
```

The collector fans out:

- Logs → Loki (`otlphttp` → `http://loki:3100/otlp`)
- Traces → Tempo (`otlphttp` → `http://tempo:4318`)
- Metrics → Mimir (`prometheusremotewrite` → `http://mimir:9009/api/v1/push`)

## Dashboards

The **Crontech Overview** dashboard is pre-provisioned at
<http://localhost:3000/d/crontech-overview>. It covers:

- API request rate
- p50 / p95 / p99 latency
- Error rate (5xx / total)
- AI tokens consumed by model
- Edge vs cloud split by `deployment.environment`
- Live API log stream from Loki

Add more dashboards by dropping JSON files into `infra/lgtm/dashboards/` —
Grafana watches the folder and reloads every 30s.

## Drift guard

`apps/api/test/observability.test.ts` parses
`infra/lgtm/dashboards/crontech-overview.json` and asserts that every
panel target references a metric name the codebase actually emits (see
`apps/api/src/telemetry.ts`). A dashboard pointing at a nonexistent
metric fails the test — no silent drift.
