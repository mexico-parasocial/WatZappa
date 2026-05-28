FROM node:24-alpine AS build

RUN apk add --no-cache python3 make g++ py3-pip
RUN corepack enable

WORKDIR /app

COPY ./package.json ./
RUN corepack install

# Move files into the image and install
COPY ./*.* ./
COPY ./tsconfig ./tsconfig
COPY ./lexicons ./lexicons
COPY ./packages/internal ./packages/internal
COPY ./packages/lex ./packages/lex

# NOTE: matrix-bridge's transitive dependencies.
# pnpm list --filter '@para/matrix-bridge...' --depth 0 --json | jq '.[].path' | grep -v "/lex/" | grep -v "/internal/" | sort -u
COPY ./packages/api ./packages/api
COPY ./packages/aws ./packages/aws
COPY ./packages/common-web ./packages/common-web
COPY ./packages/common ./packages/common
COPY ./packages/crypto ./packages/crypto
COPY ./packages/did ./packages/did
COPY ./packages/identity ./packages/identity
COPY ./packages/lex-cli ./packages/lex-cli
COPY ./packages/lexicon ./packages/lexicon
COPY ./packages/oauth/jwk-jose ./packages/oauth/jwk-jose
COPY ./packages/oauth/jwk-webcrypto ./packages/oauth/jwk-webcrypto
COPY ./packages/oauth/jwk ./packages/oauth/jwk
COPY ./packages/oauth/oauth-client-browser-example ./packages/oauth/oauth-client-browser-example
COPY ./packages/oauth/oauth-client-browser ./packages/oauth/oauth-client-browser
COPY ./packages/oauth/oauth-client ./packages/oauth/oauth-client
COPY ./packages/oauth/oauth-provider-api ./packages/oauth/oauth-provider-api
COPY ./packages/oauth/oauth-provider-ui ./packages/oauth/oauth-provider-ui
COPY ./packages/oauth/oauth-provider ./packages/oauth/oauth-provider
COPY ./packages/oauth/oauth-scopes ./packages/oauth/oauth-scopes
COPY ./packages/oauth/oauth-types ./packages/oauth/oauth-types
COPY ./packages/pds ./packages/pds
COPY ./packages/repo ./packages/repo
COPY ./packages/sync ./packages/sync
COPY ./packages/syntax ./packages/syntax
COPY ./packages/ws-client ./packages/ws-client
COPY ./packages/xrpc-server ./packages/xrpc-server
COPY ./packages/xrpc ./packages/xrpc

COPY ./services/matrix-bridge ./services/matrix-bridge

# install all deps
RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --frozen-lockfile
# build all packages with external node_modules
RUN pnpm run --recursive --stream --filter '@para/matrix-bridge...' build
# install only prod deps, hoisted to root node_modules dir
RUN pnpm install --prod --shamefully-hoist --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false

WORKDIR services/matrix-bridge

# Uses assets from build stage to reduce build size
FROM node:24-alpine

RUN apk add --update dumb-init sqlite

# Avoid zombie processes, handle signal forwarding
ENTRYPOINT ["dumb-init", "--"]

WORKDIR /app/services/matrix-bridge
COPY --from=build /app /app
RUN mkdir /app/data && chown node /app/data

VOLUME /app/data
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node
CMD ["node", "--heapsnapshot-signal=SIGUSR2", "--enable-source-maps", "dist/index.js"]

LABEL org.opencontainers.image.source=https://github.com/bluesky-social/atproto
LABEL org.opencontainers.image.description="Matrix↔PARA Community Bridge"
LABEL org.opencontainers.image.licenses=MIT
