# Argo Rollouts Demo

This repository contains a demonstration of Argo Rollouts for progressive delivery in Kubernetes. The project consists of a full-stack application with a React frontend and Go backend, deployed using GitOps principles.

## Project Structure

```
.
├── argo-rollouts-demo-be/    # Go backend service
├── argo-rollouts-demo-fe/    # React frontend application
├── gitops/                   # GitOps configuration and manifests
├── terraform/               # Infrastructure as Code
└── .github/                 # GitHub Actions workflows
```

## Components

### Backend Service
- Written in Go
- RESTful API implementation
- Containerized using Docker
- Located in `argo-rollouts-demo-be/`

### Frontend Application
- Built with React
- Containerized using Docker
- Served through Nginx
- Located in `argo-rollouts-demo-fe/`

### GitOps Configuration
- Kubernetes manifests
- Argo Rollouts configurations
- Located in `gitops/`

## Prerequisites

- Kubernetes cluster
- Argo CD installed
- Argo Rollouts installed
- Docker
- Go 1.x
- Node.js 16+

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/argo-rollouts-demo.git
   cd argo-rollouts-demo
   ```

2. Build and push the container images:
   ```bash
   # Build and push backend
   cd argo-rollouts-demo-be
   docker build -t your-registry/argo-rollouts-demo-be:latest .
   docker push your-registry/argo-rollouts-demo-be:latest

   # Build and push frontend
   cd ../argo-rollouts-demo-fe
   docker build -t your-registry/argo-rollouts-demo-fe:latest .
   docker push your-registry/argo-rollouts-demo-fe:latest
   ```

3. Deploy using GitOps:
   ```bash
   # Apply the GitOps configuration
   kubectl apply -f gitops/apps/
   ```

## Progressive Delivery

This demo showcases Argo Rollouts features:
- Blue-Green deployments
- Canary deployments
- Automated rollbacks
- Traffic management
- Analysis and metrics

## Development

### Backend Development
```bash
cd argo-rollouts-demo-be
go mod download
go run api.go
```

### Frontend Development
```bash
cd argo-rollouts-demo-fe
npm install
npm run dev
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
