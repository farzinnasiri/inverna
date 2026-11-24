SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8081

.PHONY: help install dev dev-portless dev-client web start expo ios android check typecheck test sounds build-web deploy doctor \
	build-ios-dev build-ios-sim build-ios-preview build-ios-testflight submit-testflight builds credentials

help: ## List available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "make %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies with pnpm
	pnpm install

# --- Develop --------------------------------------------------------------

dev: dev-portless ## Run Lull through Portless (named local URL + LAN Metro)

dev-portless: ## Run Lull through Portless (auto-picks free port, works alongside other apps)
	node scripts/dev-portless.mjs

dev-client: ## Run Metro for your installed iPhone development build (--dev-client --lan + Portless)
	EXPO_DEV_CLIENT=1 node scripts/dev-portless.mjs

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

build-ios-dev: ## Cloud-build signed iPhone development build (expo-dev-client) on GitHub Actions
	rnd build --platform ios --profile development-device

build-ios-sim: ## Cloud-build iOS Simulator development build on GitHub Actions
	rnd build --platform ios --profile development

build-ios-preview: ## Cloud-build standalone ad-hoc preview IPA on GitHub Actions
	rnd build --platform ios --profile preview

build-ios-testflight: ## Cloud-build signed App Store / TestFlight IPA on GitHub Actions
	rnd build --platform ios --profile production

submit-testflight: ## Download latest finished production IPA and submit to TestFlight via asc
	@BUILD_ID=$$(rnd build:list --platform ios --profile production --status FINISHED --limit 1 --json | node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); const b = Array.isArray(d) ? d[0] : d?.builds?.[0]; console.log(b?.id ?? '');"); \
	if [ -z "$$BUILD_ID" ]; then echo "No finished production iOS build found"; exit 1; fi; \
	rm -rf build && mkdir -p build && \
	rnd build:download --build-id "$$BUILD_ID" --output build/lull.ipa && \
	rnd submit --platform ios --profile production --path build/lull.ipa

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
