package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	io_prometheus_client "github.com/prometheus/client_model/go"
)

type ErrorRate struct {
	Value float64 `json:"value"` // Expecting the key "value"
}

var (
	errorRate = 0.0 // Default error rate (0% chance of 400)
	mu        sync.Mutex
	version   = os.Getenv("VERSION") // Get version from environment variable
	rng       = rand.New(rand.NewSource(time.Now().UnixNano()))
	buildHash = "5vj730"

	// Prometheus metrics
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests by endpoint and status code",
		},
		[]string{"endpoint", "status_code"},
	)
)

func checkHandler(c echo.Context) error {
	mu.Lock()
	currentErrorRate := errorRate
	mu.Unlock()

	// Determine if the response should be an error (500) based on errorRate
	statusCode := http.StatusOK
	if rng.Float64() < currentErrorRate {
		statusCode = http.StatusInternalServerError
	}

	// Record the request in Prometheus metrics
	httpRequestsTotal.WithLabelValues("/api/check", fmt.Sprintf("%d", statusCode)).Inc()

	// Set X-Version header
	c.Response().Header().Set("X-Version", version)
	return c.NoContent(statusCode)
}

func healthzHandler(c echo.Context) error {
	statusCode := http.StatusOK
	httpRequestsTotal.WithLabelValues("/api/healthz", fmt.Sprintf("%d", statusCode)).Inc()
	return c.NoContent(statusCode)
}

func setErrorRate(c echo.Context) error {
	var newRate ErrorRate
	if err := json.NewDecoder(c.Request().Body).Decode(&newRate); err != nil {
		httpRequestsTotal.WithLabelValues("/api/set-error-rate", fmt.Sprintf("%d", http.StatusBadRequest)).Inc()
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
	}

	mu.Lock()
	errorRate = newRate.Value / 100.0 // Convert percentage to a fraction
	mu.Unlock()

	httpRequestsTotal.WithLabelValues("/api/set-error-rate", fmt.Sprintf("%d", http.StatusOK)).Inc()
	return c.JSON(http.StatusOK, map[string]string{"message": "Error rate updated"})
}

func getErrorRate(c echo.Context) error {
	mu.Lock()
	currentRate := errorRate * 100.0 // Convert fraction back to percentage
	mu.Unlock()

	httpRequestsTotal.WithLabelValues("/api/error-rate", fmt.Sprintf("%d", http.StatusOK)).Inc()
	return c.JSON(http.StatusOK, ErrorRate{Value: currentRate})
}

func metricsHandler(c echo.Context) error {
	metrics := make(map[string]map[string]float64)
	metricChan := make(chan prometheus.Metric, 100)
	httpRequestsTotal.Collect(metricChan)
	close(metricChan)
	for metric := range metricChan {
		m := &io_prometheus_client.Metric{}
		if err := metric.Write(m); err != nil {
			continue
		}
		if m.Label == nil {
			continue
		}
		var endpoint, statusCode string
		for _, label := range m.Label {
			if label.GetName() == "endpoint" {
				endpoint = label.GetValue()
			} else if label.GetName() == "status_code" {
				statusCode = label.GetValue()
			}
		}
		if endpoint == "" || statusCode == "" {
			continue
		}
		// Skip the /api/error-rate and /api/set-error-rate endpoints
		if endpoint == "/api/error-rate" || endpoint == "/api/set-error-rate" {
			continue
		}
		if _, ok := metrics[endpoint]; !ok {
			metrics[endpoint] = make(map[string]float64)
		}
		metrics[endpoint][statusCode] = m.GetCounter().GetValue()
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"http_requests_total": metrics,
	})
}

func main() {
	fmt.Println("Build hash:", buildHash)
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Enable CORS with all headers exposed
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"}, // Change this to specific origins for security
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"X-Version", "Authorization", "Content-Length"}, // Expose necessary headers
		AllowCredentials: true,
	}))

	// Add Prometheus metrics endpoint
	e.GET("/api/metrics", metricsHandler)

	// Add healthz, check, error-rate, set-error-rate endpoints
	e.GET("/api/healthz", healthzHandler)
	e.GET("/api/check", checkHandler)
	e.GET("/api/error-rate", getErrorRate)
	e.POST("/api/set-error-rate", setErrorRate)

	e.Logger.Fatal(e.Start(":8080"))
}
