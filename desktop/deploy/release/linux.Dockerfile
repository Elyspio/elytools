FROM node:26-bookworm

ARG PNPM_VERSION=12.5.1
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

CMD ["./node_modules/.bin/tsx", "./scripts/build/build-release-linux-container.ts"]
