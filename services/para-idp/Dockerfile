# para-idp has no workspace dependencies — only public npm packages — so it is
# built standalone rather than through the monorepo. That keeps this image
# small and independent of the rest of the repo's build graph.
FROM node:22-alpine AS build
WORKDIR /app

# npm 10.9.x (bundled in some node:22-alpine pulls) crashes with
# "Cannot read properties of null (reading 'edgesOut')" on fresh resolves.
RUN npm install -g npm@12

COPY ./services/para-idp/package.json ./
# No workspace lockfile here, so this resolves fresh. Pin exact versions in
# package.json if byte-reproducible images become a requirement.
RUN npm install --no-audit --no-fund

COPY ./services/para-idp/tsconfig.json ./
COPY ./services/para-idp/src ./src
RUN npx tsc

FROM node:22-alpine
RUN apk add --update dumb-init wget
ENTRYPOINT ["dumb-init", "--"]
WORKDIR /app

RUN npm install -g npm@12
COPY ./services/para-idp/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 8090
ENV PORT=8090
ENV NODE_ENV=production
USER node

CMD ["node", "--enable-source-maps", "dist/index.js"]

LABEL org.opencontainers.image.description="PARA identity → OIDC shim for Matrix"
