FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY apps/agent/go.mod apps/agent/go.sum* ./
RUN go mod download
COPY apps/agent .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /egagent ./cmd/egagent

FROM gcr.io/distroless/base-debian12:nonroot
COPY --from=build /egagent /egagent
EXPOSE 8443
ENTRYPOINT ["/egagent"]
