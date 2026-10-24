# -----------------------------------------------------------------------------
# LG Soundbar integration image.
#
# A Node.js service (the Gladys side, through the SDK) that keeps a TCP
# connection to each LG Wi-Fi soundbar of the local network (port 9741, the
# "temescal" protocol of the LG app). No native module, no install script,
# no port exposed: the container connects out to the soundbars.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data (the soundbars seen, their last state)
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see build.yml
# -----------------------------------------------------------------------------

FROM node:24-alpine

# The version label and the manifest label are added by build.yml.
LABEL org.opencontainers.image.title="gladys-lg-soundbar" \
      org.opencontainers.image.description="LG Wi-Fi soundbars in Gladys Assistant, on the local network (not affiliated with LG)" \
      org.opencontainers.image.source="https://github.com/William-De71/gladys-lg-soundbar" \
      org.opencontainers.image.licenses="Apache-2.0"

# dumb-init: handles signals (SIGTERM) correctly for a graceful shutdown.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install the PROD dependencies first (better build cache). `npm ci` only:
# a lockfile out of sync with package.json must fail the build, not be
# silently re-resolved into an untested dependency tree.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Then the integration code.
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json LICENSE NOTICE ./

# The only writable location allowed at runtime. Docker creates a new volume
# with the owner of the image's /data, so it must belong to `node`, and before
# VOLUME: changes made to /data after it are discarded. Without this, /data is
# root-owned and the integration cannot write to it.
ENV NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Run as an unprivileged user (already present in the node image).
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
