package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

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
	errorRate     atomic.Uint64 // Store as uint64 bits of float64 for atomic operations
	version       = getEnvOrDefault("VERSION", "1")
	buildHash     = getEnvOrDefault("BUILD_HASH", "dev")
	rng           = rand.New(rand.NewSource(time.Now().UnixNano()))
	rngMu         sync.Mutex
	redisClient   *redis.Client
	redisCtx      = context.Background()

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
	currentErrorRate := getErrorRate()

	// Determine if the response should be an error (500) based on errorRate
	statusCode := http.StatusOK
	rngMu.Lock()
	if rng.Float64() < currentErrorRate {
		statusCode = http.StatusInternalServerError
	}
	rngMu.Unlock()

	// Record the request in Prometheus metrics
	httpRequestsTotal.WithLabelValues("/api/check", fmt.Sprintf("%d", statusCode)).Inc()

	// Update Redis with the new count (non-blocking)
	if redisClient != nil {
		key := fmt.Sprintf("status_%d", statusCode)
		go redisClient.Incr(redisCtx, key)
	}

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

	if newRate.Value < 0 || newRate.Value > 100 {
		httpRequestsTotal.WithLabelValues("/api/set-error-rate", fmt.Sprintf("%d", http.StatusBadRequest)).Inc()
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Error rate must be between 0 and 100"})
	}

	storeErrorRate(newRate.Value / 100.0)

	httpRequestsTotal.WithLabelValues("/api/set-error-rate", fmt.Sprintf("%d", http.StatusOK)).Inc()
	return c.JSON(http.StatusOK, map[string]string{"message": "Error rate updated"})
}

func getErrorRateHandler(c echo.Context) error {
	currentRate := getErrorRate() * 100.0

	httpRequestsTotal.WithLabelValues("/api/error-rate", fmt.Sprintf("%d", http.StatusOK)).Inc()
	return c.JSON(http.StatusOK, ErrorRate{Value: currentRate})
}

func getErrorRate() float64 {
	bits := errorRate.Load()
	return *(*float64)(unsafe.Pointer(&bits))
}

func storeErrorRate(rate float64) {
	bits := *(*uint64)(unsafe.Pointer(&rate))
	errorRate.Store(bits)
}

func resetMetricsHandler(c echo.Context) error {
	// Reset Redis counters
	if redisClient != nil {
		if err := redisClient.Del(redisCtx, "status_200", "status_500").Err(); err != nil {
			log.Printf("Warning: Failed to reset Redis counters: %v", err)
		}
	}

	// Reset Prometheus metrics
	httpRequestsTotal.Reset()

	httpRequestsTotal.WithLabelValues("/api/reset-metrics", fmt.Sprintf("%d", http.StatusOK)).Inc()
	return c.JSON(http.StatusOK, map[string]string{"message": "Metrics reset successfully"})
}

func metricsHandler(c echo.Context) error {
	var count200, count500 float64

	// Get counts from Redis if available
	if redisClient != nil {
		count200, _ = redisClient.Get(redisCtx, "status_200").Float64()
		count500, _ = redisClient.Get(redisCtx, "status_500").Float64()
	}

	// If Redis is empty or unavailable, fallback to Prometheus metrics
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
	log.Printf("Starting server - Version: %s, Build Hash: %s", version, buildHash)

	// Initialize Redis client
	redisClient = redis.NewClient(&redis.Options{
		Addr:         getEnvOrDefault("REDIS_ADDR", "localhost:6379"),
		Password:     "",
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	// Test Redis connection
	_, err := redisClient.Ping(redisCtx).Result()
	if err != nil {
		log.Printf("Warning: Could not connect to Redis: %v", err)
		log.Println("Falling back to local metrics only")
		redisClient = nil
	}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Enable CORS
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"X-Version", "Authorization", "Content-Length"},
		AllowCredentials: true,
	}))

	// Register routes
	e.GET("/api/metrics", metricsHandler)
	e.GET("/api/healthz", healthzHandler)
	e.GET("/api/check", checkHandler)
	e.GET("/api/error-rate", getErrorRateHandler)
	e.POST("/api/set-error-rate", setErrorRate)
	e.POST("/api/reset-metrics", resetMetricsHandler)

	// Graceful shutdown
	go func() {
		if err := e.Start(":8080"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := e.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	if redisClient != nil {
		redisClient.Close()
	}

	log.Println("Server exited")
}
