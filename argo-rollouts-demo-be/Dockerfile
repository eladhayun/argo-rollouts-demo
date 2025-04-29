# Use a minimal base image with Go
FROM golang:latest AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the Go application, specifying the correct filename
RUN go build -o server api.go

# Use a minimal runtime image for deployment
FROM golang:latest

# Set the working directory
WORKDIR /root/

# Copy the compiled binary from the builder stage
COPY --from=builder /app/server .

# Define build argument for version
ARG VERSION
ENV VERSION=$VERSION

# Expose the application port
EXPOSE 8080

# Start the application
CMD ["./server"]
