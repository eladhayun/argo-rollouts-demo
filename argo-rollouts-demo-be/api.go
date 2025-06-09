package main

import (
	"context"
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
	"github.com/redis/go-redis/v9"
)

type ErrorRate struct {
	Value float64 `json:"value"` // Expecting the key "value"
}

type StatusCounts struct {
	Status200 float64 `json:"200"`
	Status500 float64 `json:"500"`
}

var (
	errorRate = 0.0 // Default error rate (0% chance of 400)
	mu        sync.Mutex
	version   = getEnvOrDefault("VERSION", "1") // Get version from environment variable
	rng       = rand.New(rand.NewSource(time.Now().UnixNano()))
	buildHash = "5vj738"

	// Redis client
	redisClient = redis.NewClient(&redis.Options{
		Addr:     getEnvOrDefault("REDIS_ADDR", "localhost:6379"),
		Password: "", // no password set
		DB:       0,  // use default DB
	})

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

	// Update Redis with the new count and timestamp
	ctx := context.Background()
	key := fmt.Sprintf("status_%d", statusCode)
	redisClient.Incr(ctx, key)
	redisClient.Set(ctx, key+":last_incr", time.Now().Format(time.RFC3339), 0)

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
	ctx := context.Background()

	// Get current time and calculate window start time
	now := time.Now()
	windowStart := now.Add(-100 * time.Second)

	// Get all keys from Redis
	keys, err := redisClient.Keys(ctx, "status_*").Result()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to get keys from Redis"})
	}

	// Initialize counters
	count200 := 0.0
	count500 := 0.0

	// For each key, get the count within the window
	for _, key := range keys {
		// Get the timestamp of when this key was last incremented
		lastIncr, err := redisClient.Get(ctx, key+":last_incr").Result()
		if err != nil {
			continue // Skip if no timestamp found
		}

		// Parse the timestamp
		lastIncrTime, err := time.Parse(time.RFC3339, lastIncr)
		if err != nil {
			continue // Skip if timestamp is invalid
		}

		// Only count if within the window
		if lastIncrTime.After(windowStart) {
			count, err := redisClient.Get(ctx, key).Float64()
			if err != nil {
				continue
			}

			if key == "status_200" {
				count200 = count
			} else if key == "status_500" {
				count500 = count
			}
		}
	}

	// If Redis is empty or no data in window, fallback to Prometheus metrics
	if count200 == 0 && count500 == 0 {
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
			// Only count /api/check endpoint
			if endpoint == "/api/check" {
				if statusCode == "200" {
					count200 = m.GetCounter().GetValue()
				} else if statusCode == "500" {
					count500 = m.GetCounter().GetValue()
				}
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]float64{
		"200": count200,
		"500": count500,
	})
}

func getEnvOrDefault(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func main() {
	fmt.Println("Build hash:", buildHash)

	// Test Redis connection
	ctx := context.Background()
	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		fmt.Printf("Warning: Could not connect to Redis: %v\n", err)
		fmt.Println("Falling back to local metrics only")
	}

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
