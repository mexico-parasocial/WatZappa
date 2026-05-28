# Manual de Despliegue PARA + Matrix

> **Última actualización:** 2026-05-14  
> **Stack:** Node.js 22, TypeScript, pnpm, PostgreSQL, Redis, Docker, Synapse  
> **Hardware objetivo:** AMD Ryzen 9 5950X, 128GB RAM (bare metal)

---

> ⚠️ **IMPORTANTE: Matrix es un stack OPCIONAL y separado**
>
> Este manual documenta tanto el backend principal (PDS + AppView) como el stack
> de Matrix/Synapse/Element para deliberación comunitaria. Sin embargo:
>
> - `docker-compose.prod.yaml` **NO incluye** Matrix
> - `deploy-production.sh` **NO despliega** Matrix automáticamente
> - `pre-deploy-check.sh` **NO bloquea** si faltan variables de Matrix
> - `smoke-test-production.sh` **NO testea** Matrix
>
> Si necesitas Matrix, síguelo como paso adicional tras el deploy principal.
> Si no lo necesitas, salta directamente a la Sección 2.

---

## 1. Requisitos Previos

### Software en el servidor

```bash
# Verificar instalaciones
docker --version        # >= 24.0
docker compose version  # >= 2.20
node --version          # >= 22.0
pnpm --version          # >= 8.0
caddy version           # >= 2.7
```

### DNS Configurado

| Dominio              | Tipo | Valor           |
| -------------------- | ---- | --------------- |
| `para.social`        | A    | IP del servidor |
| `pds.para.social`    | A    | IP del servidor |
| `chat.para.social`   | A    | IP del servidor |
| `matrix.para.social` | A    | IP del servidor |

### Archivos de entorno

Crea `.env` en la raíz del proyecto a partir de `.env.example`:

```bash
cp WhatZatppa/.env.example .env
nano .env  # Edita todos los valores
```

**Variables críticas:**

```bash
# PostgreSQL
POSTGRES_USER=pg
POSTGRES_PASSWORD=<generar-con- generate-secrets.sh>

# PDS
PDS_HOSTNAME=pds.para.social
PDS_ADMIN_PASSWORD=<generar>

# Matrix
MATRIX_SERVER_NAME=matrix.para.social
MATRIX_DOMAIN=chat.para.social
MATRIX_DB_NAME=matrix
MATRIX_ADMIN_TOKEN=<se-obtiene-en-paso-3>

# OpenAI (Agent Chat)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Bridge
PDS_FIREHOSE_URL=wss://pds.para.social/xrpc/com.atproto.sync.subscribeRepos
MATRIX_HOMESERVER_URL=http://synapse:8008
```

---

## 2. Despliegue del Backend WhatZatppa (PDS + AppView)

### 2.1 Generar secretos

```bash
cd WhatZatppa
./scripts/generate-secrets.sh
```

Esto genera:

- `PDS_ADMIN_PASSWORD`
- `PDS_PLC_ROTATION_KEY_K256_PRIVATEKEY_HEX`
- JWT signing keys

### 2.2 Iniciar infraestructura base

```bash
docker compose -f docker-compose.prod.yaml up -d postgres redis
```

Espera a que Postgres esté saludable:

```bash
docker compose -f docker-compose.prod.yaml ps
# Estado: healthy
```

### 2.3 Iniciar PDS y AppView

```bash
docker compose -f docker-compose.prod.yaml up -d pds bsky ozone
```

Verificar health checks:

```bash
curl http://localhost:3000/healthz   # PDS
curl http://localhost:3001/healthz   # AppView (bsky)
curl http://localhost:3002/healthz   # Ozone
```

### 2.4 Crear cuenta admin en PDS

```bash
curl -X POST http://localhost:3000/xrpc/com.atproto.server.createAccount \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@para.social",
    "handle": "admin.para.social",
    "password": "<PDS_ADMIN_PASSWORD>",
    "inviteCode": "admin"
  }'
```

---

## 3. Despliegue de Matrix (Synapse + Bridge)

### 3.1 Generar configuración de Synapse

```bash
./WhatZatppa/deploy/matrix/setup.sh
```

Esto crea:

- `WhatZatppa/deploy/matrix/synapse/homeserver.yaml`
- `WhatZatppa/deploy/matrix/element-config.json`

### 3.2 Iniciar base de datos de Matrix

```bash
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d synapse-db
```

### 3.3 Crear usuario admin de Synapse

```bash
docker exec -it para-matrix-synapse \
  register_new_matrix_user \
  -c /data/homeserver.yaml \
  -a -u admin -p <contraseña-segura>
```

### 3.4 Obtener token de admin

```bash
curl -XPOST \
  -d '{"type":"m.login.password","user":"admin","password":"<contraseña>"}' \
  http://localhost:8008/_matrix/client/v3/login
```

Guarda el `access_token` en `.env` como `MATRIX_ADMIN_TOKEN`.

### 3.5 Iniciar todo el stack Matrix

```bash
docker compose -f WhatZatppa/docker-compose.matrix.yaml up -d --build
```

Servicios que se iniciarán:

- `para-matrix-synapse` (8008)
- `para-matrix-element` (8080)
- `para-matrix-bridge` (3001)

### 3.6 Verificar Matrix

```bash
# Synapse
curl http://localhost:8008/health

# Bridge
curl http://localhost:3001/healthz
curl http://localhost:3001/metrics

# Element Web (via Caddy)
curl -I https://chat.para.social
```

---

## 4. Configuración de Caddy (Reverse Proxy)

### 4.1 Caddyfile principal

```caddy
# /etc/caddy/Caddyfile

para.social {
    reverse_proxy localhost:3001  # AppView
}

pds.para.social {
    reverse_proxy localhost:3000  # PDS
}

chat.para.social {
    reverse_proxy localhost:8080  # Element Web
}

matrix.para.social {
    reverse_proxy localhost:8008  # Synapse Client API
}

# Federation well-known
matrix.para.social/.well-known/matrix/server {
    header Content-Type application/json
    respond `{ "m.server": "matrix.para.social:443" }`
}

matrix.para.social/.well-known/matrix/client {
    header Content-Type application/json
    respond `{ "m.homeserver": { "base_url": "https://matrix.para.social" } }`
}
```

### 4.2 Recargar Caddy

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

---

## 5. Verificación Post-Deploy

### 5.1 Checklist de servicios

| Servicio | URL                                                              | Estado esperado   |
| -------- | ---------------------------------------------------------------- | ----------------- |
| PDS      | `https://pds.para.social/xrpc/com.atproto.server.describeServer` | 200 JSON          |
| AppView  | `https://para.social/healthz`                                    | `{"status":"ok"}` |
| Element  | `https://chat.para.social`                                       | Login screen      |
| Synapse  | `https://matrix.para.social/_matrix/static/`                     | Synapse info page |
| Bridge   | `https://bridge.para.social/healthz`                             | `{"status":"ok"}` |

### 5.2 Prueba de comunidad

1. Crear cuenta en PARA app
2. Crear comunidad "Test Deploy"
3. Verificar en Synapse Admin que existe el space `!xxx:matrix.para.social`
4. Verificar que el creador tiene PL 100
5. Unirse a la comunidad desde otra cuenta
6. Verificar que recibe invite al space

### 5.3 Prueba de chat

1. Abrir comunidad en app
2. Tocar 💬 Chat
3. Verificar auto-login (no debe pedir credenciales)
4. Enviar mensaje desde app
5. Verificar que aparece en Element Web

---

## 6. Troubleshooting

### Synapse no inicia

```bash
docker logs para-matrix-synapse | tail -50
# Común: permisos de /data o DB no creada
```

### Bridge no conecta al firehose

```bash
docker logs para-matrix-bridge | grep -i "firehose\|error"
# Verificar PDS_FIREHOSE_URL apunta a WS correcto
```

### Element Web muestra "Unable to connect"

```bash
# Verificar Caddy config
curl -v https://chat.para.health
# Verificar homeserver.yaml: public_baseurl
```

### Auto-auth no funciona

```bash
# Verificar que bridge puede llamar Synapse Admin API
curl -H "Authorization: Bearer <MATRIX_ADMIN_TOKEN>" \
  http://localhost:8008/_synapse/admin/v1/users/%40did-plc-xxx%3Amatrix.para.social
```

---

## 7. Backup y Mantenimiento

### Backup diario

```bash
#!/bin/bash
# /opt/para/backup.sh

date=$(date +%Y%m%d)

# Synapse data
docker run --rm -v whatzatppa_synapse_data:/source -v /backups:/backup alpine \
  tar czf /backup/synapse-${date}.tar.gz -C /source .

# Bridge DB
cp /var/lib/docker/volumes/whatzatppa_bridge_data/_data/bridge.db /backups/bridge-${date}.db

# Postgres
docker exec para-postgres pg_dump -U pg para > /backups/para-${date}.sql
docker exec para-matrix-db pg_dump -U pg matrix > /backups/matrix-${date}.sql
```

### Actualización

```bash
# 1. Backup
cd /opt/para && ./backup.sh

# 2. Pull nueva imagen
docker compose -f WhatZatppa/docker-compose.prod.yaml pull
docker compose -f WhatZatppa/docker-compose.matrix.yaml pull

# 3. Rebuild bridge
cd WhatZatppa/services/matrix-bridge && pnpm install && pnpm run build

# 4. Restart
docker compose -f docker-compose.prod.yaml up -d
docker compose -f docker-compose.matrix.yaml up -d --build
```

---

## 8. Referencias Rápidas

| Comando                                                              | Propósito                      |
| -------------------------------------------------------------------- | ------------------------------ |
| `docker compose -f docker-compose.matrix.yaml logs -f matrix-bridge` | Logs del bridge en tiempo real |
| `docker exec -it para-matrix-synapse sqlite3 /data/homeserver.db`    | DB directa de Synapse          |
| `docker exec -it para-matrix-bridge sqlite3 /data/bridge.db`         | Mapeos comunidad↔Matrix       |
| `docker restart para-matrix-bridge`                                  | Reiniciar bridge               |

---

_Documento creado: 2026-05-05_  
_PARA Infrastructure Team_
