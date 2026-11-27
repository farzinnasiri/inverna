SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8081

.PHONY: lint help install dev dev-portless expo-dev dev-client web start expo ios android check typecheck test build-web deploy doctor \
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
	APP_VARIANT=$${APP_VARIANT:-development} pnpm exec expo start --lan --port $(PORT)

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

submit-beta: ## Upload one Inverna Beta build to TestFlight: make submit-beta BUILD=<id from make builds>
	@$(MAKE) --no-print-directory submit-latest PROFILE=beta

build-ios-release: ## Cloud-build Inverna for App Review and the App Store (com.oooflabs.inverna)
	rnd build --platform ios --profile production

submit-release: ## Upload one Inverna build to App Store Connect: make submit-release BUILD=<id from make builds>
	@$(MAKE) --no-print-directory submit-latest PROFILE=production

build-ios-testflight: build-ios-beta ## Alias: TestFlight builds are Inverna Beta now

submit-testflight: submit-beta ## Alias: TestFlight uploads are Inverna Beta now

# A named build, never "the latest": the newest finished build can be from
# another branch or commit than the one meant for review (ISS-07).
submit-latest:
	@test -n "$(PROFILE)" || { echo "PROFILE is required"; exit 1; }
	@test -n "$(BUILD)" || { echo "BUILD is required: pick the build id from 'make builds' (check its commit)"; exit 1; }
	@BUILD_ID="$(BUILD)"; \
	rm -rf build && mkdir -p build && \
	rnd build:download --build-id "$$BUILD_ID" --non-interactive && \
	(cd build && unzip -o -q "$$BUILD_ID.zip") && \
	IPA=$$(find build -name '*.ipa' | head -1) && test -n "$$IPA" && \
	rnd submit --platform ios --profile $(PROFILE) --path "$$IPA" --non-interactive

builds: ## List recent React Native Deploy builds
	rnd build:list

credentials: ## Verify GitHub Actions signing secrets for iOS
	rnd credentials --platform ios

# --- Quality --------------------------------------------------------------

check: typecheck lint test ## Typechecks, lint, and all tests

lint: ## Lint for real bugs (hooks, purity of src/core, unawaited promises)
	pnpm run lint

typecheck: ## Type check the app, the pure src/core, and our .web files
	pnpm run typecheck

test: ## Run all unit tests
	pnpm test

doctor: ## Check Expo SDK & dependency health
	pnpm run doctor

# --- Assets & Web PWA Deploy ----------------------------------------------

sounds: ## Regenerate procedural bundled WAV loops & cues for native iOS/Android
	pnpm run sounds

deploy-site: ## Deploy the privacy, support and home pages to inverna.app
	cd site && npx wrangler deploy

build-web: ## Export Expo web bundle + offline PWA service worker into dist/
	pnpm run build

deploy: build-web ## Build and deploy static PWA to Cloudflare Workers
	npx wrangler deploy
