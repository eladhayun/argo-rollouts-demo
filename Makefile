API_ADDRESS = 4.255.62.39

.PHONY: port-forward-argocd run-frontend-dev get-argocd-password watch-rollout watch-github-actions watch-metrics

port-forward-argocd:
	kubectl port-forward svc/argocd-server -n argocd 8080:443

run-frontend-dev:
	cd argo-rollouts-demo-fe && export VITE_API_BASE_URL=http://$(API_ADDRESS) && npm run dev

get-argocd-password:
	@kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d && echo

watch-rollout:
	kubectl argo rollouts get rollout argo-rollouts-demo-be -n demo -w

watch-github-actions:
	gh run watch $(shell gh run list --limit 1 --json databaseId --jq '.[0].databaseId')

watch-metrics:
	watch -n 1 'curl -s http://$(API_ADDRESS)/api/metrics | jq'
