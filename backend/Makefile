Go=go

TARGETS := phr-server
VERSION := $(shell git rev-parse --short HEAD)-$(shell date +%Y%m%d%H%M%S)

IMAGE_NAME := phr-server
IMAGE_VERSION := $(IMAGE_NAME):$(VERSION)


build:
	GOOS=linux GOARCH=amd64 go build -o $(TARGETS) ./cmd/server

image: build
	docker build -t $(IMAGE_VERSION) . --platform linux/amd64

clean:
	rm -f $(TARGETS)

lint:
	#@gometalinter --disable-all --enable=gosec --exclude="Errors unhandled"  ./...
	@golangci-lint run --deadline=5m
