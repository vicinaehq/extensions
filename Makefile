clean:
	find . -name 'node_modules' -type d -exec rm -rf {} \;
.PHONY: clean

deploy:
	bun scripts/deploy-extension.ts $(shell ls -1 extensions)
.PHONY: deploy

validate-all:
	bun scripts/validate-extension.ts $(shell ls -1 extensions)
.PHONY:
	validate-all

deploy-single:
	@if [ -z "$(EXT)" ]; then \
		echo "Usage: make deploy-single EXT=extension-name"; \
		exit 1; \
	fi
	bun scripts/deploy-extension.ts $(EXT)
.PHONY: deploy-single

validate:
	@if [ -z "$(EXT)" ]; then \
		echo "Usage: make validate EXT=extension-name"; \
		echo "Or:    make validate EXT=\"ext1 ext2 ext3\""; \
		exit 1; \
	fi
	bun scripts/validate-extension.ts $(EXT)
.PHONY: validate
