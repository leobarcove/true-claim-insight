# True Claim Insight — the edge: Caddy serving both frontends and proxying the
# API. Packaged in CI from the two Vite builds; context laid out by
# ci/assemble.sh as adjuster/, claimant/ and Caddyfile.
FROM caddy:2-alpine
COPY adjuster /srv/adjuster
COPY claimant /srv/claimant
COPY Caddyfile /etc/caddy/Caddyfile
