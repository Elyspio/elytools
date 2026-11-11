# Builds the Linux packages (AppImage, deb) from Windows: scripts/release/release.ts builds it from desktop/, mounts dist/ and runs it
FROM node:26-trixie

ARG PNPM_VERSION=12.18.0
WORKDIR /project/desktop

# electronuserland/builder stops at Node 24: install the few system tools electron-builder needs for AppImage/deb targets
RUN apt-get update \
	&& apt-get install -y --no-install-recommends fakeroot \
	&& rm -rf /var/lib/apt/lists/*

# Node 25+ images ship without corepack
RUN npm install -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN node ./node_modules/electron-builder/cli.js install-app-deps

# electron-vite runs directly: `pnpm build` (prebuild) would empty the mounted dist/.
# RELEASE_VERSION (development builds) sets the version of the packages without changing package.json
ENV ELYTOOLS_DISABLE_MAIN_BYTECODE=1
CMD ["sh", "-c", "pnpm exec electron-vite -c config/electron.vite.config.ts build && pnpm exec electron-builder --config config/electron-builder.yml --linux AppImage deb --publish never ${RELEASE_VERSION:+-c.extraMetadata.version=$RELEASE_VERSION}"]
