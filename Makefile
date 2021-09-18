.PHONY: default build serve update

default: build

build:
	@bundle exec jekyll build

serve:
	@bundle exec jekyll serve

update:
	@bundle update
