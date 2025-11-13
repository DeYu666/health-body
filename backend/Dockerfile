FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/gcr.io/distroless/base-debian12:latest AS builder
ENV PORT=8080
WORKDIR /srv
COPY ./phr-server /usr/local/bin/phr-server

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/phr-server"]
