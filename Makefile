.PHONY: all clean install check test lint-install lint

INCOMPATIBLE_ESLINT_VERSIONS=$(shell node --version | egrep 'v0.[2-9]' | cut -d '.' -f 1-2)

all:

clean:
	rm -rf node_modules

install:
	npm install

check:
	npm test

test:
	npm test

lint-install:
ifeq ($(INCOMPATIBLE_ESLINT_VERSIONS),)
	npm run lint-install
else
	@echo "Lint not available on $(INCOMPATIBLE_ESLINT_VERSIONS)"
endif

lint:
ifeq ($(INCOMPATIBLE_ESLINT_VERSIONS),)
	npm run lint
else
	@echo "Lint not available on $(INCOMPATIBLE_ESLINT_VERSIONS)"
endif
