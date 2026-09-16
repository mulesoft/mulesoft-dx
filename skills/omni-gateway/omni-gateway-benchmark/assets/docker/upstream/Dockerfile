# Repackages asoorm/go-bench-suite (Apache-2.0) into our ECR.
# Pinned to a specific commit so rebuilds are reproducible.
FROM golang:1.22 AS build
ARG SOURCE_REF=d691810103137cbbab18586ced2aff6382c8300a
WORKDIR /src
RUN git clone https://github.com/asoorm/go-bench-suite.git . \
 && git checkout "$SOURCE_REF" \
 && CGO_ENABLED=0 GOFLAGS=-mod=mod go build -o /out/bench-suite .

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/bench-suite /bench-suite
EXPOSE 8080
ENTRYPOINT ["/bench-suite", "upstream", "--addr=:8080"]
