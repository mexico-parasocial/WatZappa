# Guía de Administración: Infraestructura Matrix para PARA

> **Versión:** 1.0  
> **Idioma:** Español  
> **Público:** Administradores de sistemas / DevOps  
> **Requisitos:** Docker, Docker Compose, acceso SSH al servidor bare metal

---

## 📋 Resumen de la Arquitectura

```
┌─────────────┐      firehose      ┌──────────────────┐      Admin API     ┌─────────────┐
│  PDS/BSKY   │ ─────────────────> │  para-matrix-bot │ ─────────────────> │   Synapse   │
│  (atproto)  │   repo commits     │  (Node.js 22)    │   (HTTP 8008)    │ (homeserver)│
└─────────────┘                    └──────────────────┘                  └─────────────┘
                                          │                                      │
                                          │ SQLite                               │ PostgreSQL
                                          ▼                                      ▼
                                    ┌─────────────┐                        ┌─────────────┐
                                    │  bridge.db  │                        │ synapse-db  │
                                    │ (mappings)  │                        │  (datos)    │
                                    └─────────────┘                        └─────────────┘
```

**Componentes:**

- **Synapse** — Servidor Matrix (homeserver)
- **synapse-db** — PostgreSQL para datos de Matrix
- **Element Web** — Cliente web en `chat.para.social`
- **matrix-bridge** — Servicio de sincronización PARA↔Matrix
- **bridge-db** — SQLite para mapeos (comunidad→espacio, DID→MXID)

---

## 🔒 Modelo de Seguridad

Esta instalación opera en modo **PARA-Only** (sin federación):

| Configuración                        | Valor   | Justificación                                     |
| ------------------------------------ | ------- | ------------------------------------------------- |
| `federation_domain_whitelist`        | `[]`    | Nadie fuera de PARA puede conectarse              |
| `enable_registration`                | `false` | Solo el bridge puede crear usuarios vía Admin API |
| `allow_public_rooms_over_federation` | `false` | Las salas no son descubribles públicamente        |
| `allow_public_rooms_without_auth`    | `false` | Requiere autenticación para ver salas             |

**⚠️ Advertencia:** No habilites la federación sin evaluar los riesgos de moderación cross-server y filtración de datos de comunidades cerradas.

---

## 🚀 Despliegue Paso a Paso

### 1. Preparación del Servidor

**Requisitos de hardware (ya cumplidos en tu 5950X + 128GB):**

- CPU: 4+ cores
- RAM: 8GB mínimo para Synapse (tienes 128GB)
- Disco: 50GB+ SSD para datos
- Puerto 8008 (interno) y 443 (externo vía Caddy)

### 2. Configurar Variables de Entorno

Edita `.env` en la raíz del proyecto:

```bash
# ─── Matrix ───
MATRIX_SERVER_NAME=matrix.para.social
MATRIX_DOMAIN=chat.para.social
MATRIX_DB_NAME=matrix
MATRIX_ADMIN_TOKEN=<token-de-admin-generado-en-paso-4>

# ─── Bridge ───
PDS_FIREHOSE_URL=wss://pds.para.social/xrpc/com.atproto.sync.subscribeRepos
MATRIX_HOMESERVER_URL=http://synapse:8008
M8_BASE_URL=http://host.docker.internal:8787/v1
BRIDGE_DB_PATH=/data/bridge.db
BRIDGE_LOG_LEVEL=info
```

### 3. Generar Configuración de Synapse

```bash
./WhatZatppa/deploy/matrix/setup.sh
```

Este script:

1. Genera `homeserver.yaml` con federation desactivada
2. Genera `element-config.json` apuntando a tu servidor
3. Muestra los snippets para `.well-known/matrix/*`

### 4. Crear Usuario Administrador

```bash
# Iniciar solo Synapse y la base de datos
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d synapse synapse-db

# Crear usuario admin
docker exec -it para-matrix-synapse \
  register_new_matrix_user \
  -c /data/homeserver.yaml \
  -a \
  -u admin \
  -p <contraseña-segura>

# Obtener token de acceso
curl -XPOST \
  -d '{"type":"m.login.password","user":"admin","password":"<contraseña>"}' \
  http://localhost:8008/_matrix/client/v3/login
```

Guarda el `access_token` en `.env` como `MATRIX_ADMIN_TOKEN`.

### 5. Configurar Caddy (Reverse Proxy)

Usa el `Caddyfile.matrix` proporcionado:

```caddy
chat.para.social {
    reverse_proxy localhost:8080  # Element Web
}

matrix.para.social {
    reverse_proxy localhost:8008  # Synapse Client API
}
```

Aplica:

```bash
sudo caddy reload --config WhatZatppa/deploy/matrix/Caddyfile.matrix
```

### 6. Iniciar Todos los Servicios

```bash
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d
```

Servicios que se iniciarán:

- `para-matrix-synapse` (puerto 8008)
- `para-matrix-db` (PostgreSQL interno)
- `para-matrix-element` (puerto 8080)
- `para-matrix-bridge` (puerto 3001)

### 7. Verificar Estado

```bash
# Health check del bridge
curl http://localhost:3001/healthz

# Métricas Prometheus
curl http://localhost:3001/metrics

# Logs en tiempo real
docker logs -f para-matrix-bridge
```

---

## 📊 Monitoreo y Métricas

### Endpoints del Bridge

| Endpoint       | Descripción                                             |
| -------------- | ------------------------------------------------------- |
| `GET /healthz` | Estado de salud. Devuelve 503 si hay >10 syncs fallidos |
| `GET /metrics` | Métricas Prometheus (`para_matrix_*`)                   |

### Métricas Clave

```
para_matrix_invites_total      ← Total de invitaciones enviadas
para_matrix_kicks_total        ← Total de expulsiones
para_matrix_spaces_created_total ← Espacios creados para comunidades
para_matrix_sync_latency_seconds ← Latencia de sincronización
para_matrix_firehose_lag_seconds ← Retraso del firehose
para_matrix_active_users       ← Usuarios con cuenta Matrix
para_matrix_active_spaces      ← Comunidades mapeadas
```

### Alertas Recomendadas (Prometheus/Grafana)

```yaml
- alert: MatrixBridgeDown
  expr: up{job="matrix-bridge"} == 0
  for: 2m

- alert: MatrixSyncFailing
  expr: para_matrix_sync_failures_total > 10
  for: 5m

- alert: FirehoseLagHigh
  expr: para_matrix_firehose_lag_seconds > 300
  for: 5m
```

---

## 🔧 Operaciones Comunes

### Ver Usuarios Mapeados

```bash
docker exec -it para-matrix-bridge sqlite3 /data/bridge.db \
  "SELECT did, matrix_user_id FROM user_matrix_map;"
```

### Ver Comunidades Mapeadas

```bash
docker exec -it para-matrix-bridge sqlite3 /data/bridge.db \
  "SELECT community_uri, space_id, slug FROM community_space_map;"
```

### Ver Syncs Fallidos

```bash
docker exec -it para-matrix-bridge sqlite3 /data/bridge.db \
  "SELECT event_type, community_uri, did, error, created_at \
   FROM sync_log WHERE success = 0 ORDER BY created_at DESC LIMIT 20;"
```

### Forzar Reintento de Syncs Fallidos

El bridge reintenta automáticamente cada 60 segundos. Para forzar manualmente:

```bash
docker restart para-matrix-bridge
```

### Backfill de Comunidades Existentes

Si despliegas el bridge después de que las comunidades ya existen:

```bash
docker exec -it para-matrix-bridge node dist/backfill.js --pds https://pds.para.social
```

> **Nota:** Este script es un esqueleto. Debes adaptarlo para consultar tu AppView.

---

## 🗄️ Backup

### Base de Datos del Bridge (SQLite)

```bash
# Backup diario
docker exec para-matrix-bridge sqlite3 /data/bridge.db ".backup /data/bridge-backup.db"
cp /var/lib/docker/volumes/whatzatppa_bridge_data/_data/bridge-backup.db \
   /backups/bridge-$(date +%Y%m%d).db
```

### Base de Datos de Synapse (PostgreSQL)

```bash
# Backup con pg_dump
docker exec para-matrix-db pg_dump -U pg matrix > /backups/synapse-$(date +%Y%m%d).sql
```

### Datos de Synapse (volúmenes)

```bash
# Backup completo de volúmenes
docker run --rm -v whatzatppa_synapse_data:/source -v /backups:/backup \
  alpine tar czf /backup/synapse-data-$(date +%Y%m%d).tar.gz -C /source .
```

---

## 🔄 Actualización

### Actualizar Synapse

```bash
docker pull matrixdotorg/synapse:latest
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d synapse
```

### Actualizar el Bridge

```bash
cd WhatZatppa/services/matrix-bridge
git pull  # o copia los nuevos archivos
pnpm install
pnpm run build
docker compose -f ../../docker-compose.matrix.yaml up -d --build matrix-bridge
```

---

## 🛑 Rollback (Plan de Emergencia)

Si la integración causa problemas:

```bash
# 1. Detener solo el bridge (el resto de PARA sigue funcionando)
docker compose -f WhatZatppa/docker-compose.matrix.yaml stop matrix-bridge

# 2. Los usuarios conservan sus cuentas Matrix pero no hay más auto-invites
# 3. Los propietarios de comunidades pueden gestionar manualmente sus espacios
# 4. La app PARA sigue mostrando el botón Chat pero abrirá Element sin auto-login
```

---

## 📞 Escalación

| Problema            | Contacto                                       |
| ------------------- | ---------------------------------------------- |
| Fallo del bridge    | Revisar logs: `docker logs para-matrix-bridge` |
| Synapse no responde | Revisar `docker logs para-matrix-synapse`      |
| Base de datos lenta | Revisar `docker stats para-matrix-db`          |
| Problemas de red    | Verificar Caddy y DNS `.well-known/matrix/*`   |

---

## 📚 Referencias

- [Synapse Admin API](https://matrix-org.github.io/synapse/latest/usage/administration/admin_api/)
- [Element Web Config](https://github.com/element-hq/element-web/blob/develop/docs/config.md)
- [AT Protocol Firehose](https://atproto.com/specs/sync)
- Documentación interna: `WhatZatppa/services/matrix-bridge/README.md`

---

_Documento creado: 2026-05-05_  
_PARA Infrastructure Team_
