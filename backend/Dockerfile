FROM golang:1.24 AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o phr-server ./cmd/server

FROM gcr.io/distroless/base-debian12
ENV PORT=8080
WORKDIR /srv
COPY --from=builder /app/phr-server /usr/local/bin/phr-server

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/phr-server"]
