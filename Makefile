.PHONY: install uninstall build validate test smoke ci clean

TOOLS ?= claude,copilot,cursor,antigravity

install:
	./install.sh --tools=$(TOOLS)

uninstall:
	./install.sh uninstall

build:
	python3 scripts/build.py

validate:
	python3 scripts/validate.py

test: validate
	python3 scripts/build.py --check
	python3 skills/prompt-enhancer/scripts/classify.py --selftest
	python3 -m pytest tests/ -q

smoke:
	./tests/smoke_install.sh

ci: test smoke

clean:
	rm -rf dist/__pycache__ scripts/__pycache__ scripts/lib/__pycache__ tests/__pycache__
