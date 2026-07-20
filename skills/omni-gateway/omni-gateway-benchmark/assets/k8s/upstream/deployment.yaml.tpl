apiVersion: apps/v1
kind: Deployment
metadata:
  name: bench-upstream
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bench-upstream
  template:
    metadata:
      labels:
        app: bench-upstream
    spec:
      nodeSelector:
        node-role: workload
      containers:
        - name: bench
          image: ${UPSTREAM_IMAGE}
          ports:
            - name: http
              containerPort: 8080
          resources:
            requests:
              cpu: "500m"
              memory: "256Mi"
            limits:
              cpu: "2"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /echo
              port: http
            initialDelaySeconds: 1
            periodSeconds: 5
