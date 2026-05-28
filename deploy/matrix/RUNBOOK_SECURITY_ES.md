# Runbook de Seguridad de Mensajería PARA/M8

## Modelo de almacenamiento

- Synapse conserva el historial de Matrix como eventos cifrados cuando E2EE está activo.
- El bridge no es un archivo de mensajes: solo guarda mappings, membresía, eventos técnicos y estado de lectura.
- M8 guarda identidad, sesión y backups cifrados opacos; no debe recibir claves Matrix en claro.

## Rotación

- `MATRIX_ADMIN_TOKEN`: crear nuevo admin/token, actualizar `.env`, reiniciar `matrix-bridge`, revocar el token anterior.
- Sesiones Matrix de usuario: regenerar token con `/api/matrix-token`; si hay sospecha de compromiso, invalidar dispositivos desde Synapse.
- Backups cifrados M8: el cliente debe subir un nuevo blob a `/v1/identity/chat-key-backup`; M8 registra la rotación en `ledger`.
- Salas legacy sin E2EE: crear sala cifrada nueva, invitar miembros activos, marcar la sala anterior read-only y publicar aviso de migración.

## Breach drill

- Dump de bridge: no debe contener cuerpos de mensaje en `matrix_events.content`.
- Dump de Synapse: los mensajes de salas nuevas deben estar cifrados con `m.room.encrypted`.
- Dump de M8: `chat_key_backups.ciphertext` debe ser opaco; no debe haber claves o recovery phrases en claro.
- Push gateway: no debe emitir previews de contenido de mensajes.
