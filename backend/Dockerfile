FROM golang:1.24-bookworm AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/phr-server ./cmd/server

FROM scratch

ENV PORT=8080
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/phr-server /usr/local/bin/phr-server

USER 65532:65532
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/phr-server"]
