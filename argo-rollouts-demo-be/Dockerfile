# Use a minimal base image with Go
FROM golang:latest AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy the Go source code
COPY . .

# Download dependencies
RUN go mod tidy

# Build the Go application, specifying the correct filename
RUN go build -o server api.go

# Use a minimal runtime image for deployment
FROM golang:latest

# Set the working directory
WORKDIR /root/

# Copy the compiled binary from the builder stage
COPY --from=builder /app/server .

# Expose the application port
EXPOSE 8080

# Start the application
CMD ["./server"]
