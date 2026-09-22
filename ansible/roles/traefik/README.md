# traefik role — PARKED

Not on the default path. The single-host deployment uses **Caddy**, which is
already defined in `docker-compose.prod.yaml` and fronts both the app stack and
the Matrix stack over the shared `para-edge` network.

This role exists for the multi-node Swarm design in `playbooks/swarm.yml`,
which is itself parked — see that file's header for the two blockers (no image
registry, no Matrix services in the Swarm stack).

Its ACME resolver has been fixed (it used to define both `tlsChallenge` and
`httpChallenge`, which Traefik rejects, so it would never have issued a
certificate), and `traefik_acme_email` is now `acme_email` to match
`group_vars`. It is otherwise untouched and unverified.

Do not run this role alongside Caddy: both bind ports 80 and 443.
