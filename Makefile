
push:
	@git tag "$(tag)"
	@git push beta "$(tag)"

del:
	@git tag -d "$(tag)"
	@git push beta --delete "$(tag)"

build:
	zip automation.zip main.js styles.css manifest.json manifest-beta.json
