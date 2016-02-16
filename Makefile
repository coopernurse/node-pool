.PHONY: all clean install check test lint-install lint

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
	npm run lint-install

lint:
	npm run lint
