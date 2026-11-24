SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8081

.PHONY: help install dev dev-portless web start expo ios android check typecheck test sounds build-web deploy doctor

help: ## List available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "make %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies with pnpm
	pnpm install

# --- Develop --------------------------------------------------------------

dev: dev-portless ## Run Lull through Portless (named local URL + LAN Metro for Expo Go)

dev-portless: ## Run Lull through Portless (auto-picks a free Metro port, works alongside other apps)
	node scripts/dev-portless.mjs

web: ## Start Expo web dev server directly on PORT (default 8081)
	pnpm exec expo start --web --lan --port $(PORT)

start: ## Start Metro directly for Expo Go / phone over LAN
	pnpm exec expo start --lan --port $(PORT)

expo: start ## Alias for make start

ios: ## Launch on iOS Simulator
	pnpm exec expo start --ios

android: ## Launch on Android Emulator
	pnpm exec expo start --android

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
