SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8081

.PHONY: help install dev dev-portless expo-dev dev-client web start expo ios android check typecheck test build-web deploy doctor \
	build-ios-dev build-ios-sim build-ios-preview build-ios-beta submit-beta build-ios-release submit-release \
	build-ios-testflight submit-testflight submit-latest builds credentials

help: ## List available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "make %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies with pnpm
	pnpm install

# --- Develop --------------------------------------------------------------

dev: dev-portless ## Run Inverna through Portless (named local URL + LAN Metro)

dev-portless: ## Run Inverna through Portless (auto-picks free port, works alongside other apps)
	node scripts/dev-portless.mjs

expo-dev: ## Run Metro for your installed iPhone development build (--dev-client --lan + Portless)
	EXPO_DEV_CLIENT=1 node scripts/dev-portless.mjs

dev-client: expo-dev

web: ## Start Expo web dev server directly on PORT (default 8081)
	pnpm exec expo start --web --lan --port $(PORT)

start: ## Start Metro directly for Expo Go / phone over LAN
	pnpm exec expo start --lan --port $(PORT)

expo: start ## Alias for make start

ios: ## Launch on iOS Simulator
	pnpm exec expo start --ios

android: ## Launch on Android Emulator
	pnpm exec expo start --android

# --- Cloud Builds via React Native Deploy (GitHub Actions) ----------------

# Three apps, side by side (see docs/RELEASES.md): Inverna Dev, Inverna Beta, Inverna.

build-ios-dev: ## Cloud-build Inverna Dev, the dev client for your iPhone (com.oooflabs.inverna.dev)
	rnd build --platform ios --profile development-device

build-ios-sim: ## Cloud-build Inverna Dev for the iOS Simulator
	rnd build --platform ios --profile development

build-ios-preview: ## Cloud-build an ad-hoc Inverna Beta to install without TestFlight
	rnd build --platform ios --profile preview

build-ios-beta: ## Cloud-build Inverna Beta for TestFlight (com.oooflabs.inverna.beta)
	rnd build --platform ios --profile beta

submit-beta: ## Upload the latest finished Inverna Beta build to TestFlight
	@$(MAKE) --no-print-directory submit-latest PROFILE=beta

build-ios-release: ## Cloud-build Inverna for App Review and the App Store (com.oooflabs.inverna)
	rnd build --platform ios --profile production

submit-release: ## Upload the latest finished Inverna build to App Store Connect
	@$(MAKE) --no-print-directory submit-latest PROFILE=production

build-ios-testflight: build-ios-beta ## Alias: TestFlight builds are Inverna Beta now

submit-testflight: submit-beta ## Alias: TestFlight uploads are Inverna Beta now

submit-latest:
	@test -n "$(PROFILE)" || { echo "PROFILE is required"; exit 1; }
	@BUILD_ID=$$(rnd build:list --platform ios --profile $(PROFILE) --status FINISHED --limit 1 --json | node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); const b = Array.isArray(d) ? d[0] : d?.builds?.[0]; console.log(b?.id ?? '');"); \
	if [ -z "$$BUILD_ID" ]; then echo "No finished $(PROFILE) iOS build found"; exit 1; fi; \
	rm -rf build && mkdir -p build && \
	rnd build:download --build-id "$$BUILD_ID" --output build/inverna-$(PROFILE).ipa && \
	rnd submit --platform ios --profile $(PROFILE) --path build/inverna-$(PROFILE).ipa

builds: ## List recent React Native Deploy builds
	rnd build:list

credentials: ## Verify GitHub Actions signing secrets for iOS
	rnd credentials --platform ios

# --- Quality --------------------------------------------------------------

check: typecheck test ## Run typechecks (app + zero-DOM core) and all Vitest suites

typecheck: ## Type check Expo app + pure zero-DOM src/core
	pnpm run typecheck

test: ## Run all unit tests (13 game engines + highscores + sound + night + session)
	pnpm test

doctor: ## Check Expo SDK & dependency health
	pnpm run doctor

# --- Assets & Web PWA Deploy ----------------------------------------------

sounds: ## Regenerate procedural bundled WAV loops & cues for native iOS/Android
	pnpm run sounds

build-web: ## Export Expo web bundle + offline PWA service worker into dist/
	pnpm run build

deploy: build-web ## Build and deploy static PWA to Cloudflare Workers
	npx wrangler deploy
