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
)

type ErrorRate struct {
	Value float64 `json:"value"` // Expecting the key "value"
}

var (
	errorRate = 0.0 // Default error rate (0% chance of 400)
	mu        sync.Mutex
	version   = os.Getenv("VERSION") // Get version from environment variable
	rng       = rand.New(rand.NewSource(time.Now().UnixNano()))
	buildHash = "5vj708"
)

func checkHandler(c echo.Context) error {
	mu.Lock()
	currentErrorRate := errorRate
	mu.Unlock()

	// Determine if the response should be an error (400) based on errorRate
	statusCode := http.StatusOK
	if rng.Float64() < currentErrorRate {
		statusCode = http.StatusBadRequest
	}

	// Set X-Version header
	c.Response().Header().Set("X-Version", version)
	return c.NoContent(statusCode)
}

func healthzHandler(c echo.Context) error {
	statusCode := http.StatusOK
	return c.NoContent(statusCode)
}

func setErrorRate(c echo.Context) error {
	var newRate ErrorRate
	if err := json.NewDecoder(c.Request().Body).Decode(&newRate); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
	}

	mu.Lock()
	errorRate = newRate.Value / 100.0 // Convert percentage to a fraction
	mu.Unlock()

	return c.JSON(http.StatusOK, map[string]string{"message": "Error rate updated"})
}

func getErrorRate(c echo.Context) error {
	mu.Lock()
	currentRate := errorRate * 100.0 // Convert fraction back to percentage
	mu.Unlock()

	return c.JSON(http.StatusOK, ErrorRate{Value: currentRate})
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

	e.GET("/api/healthz", healthzHandler)
	e.GET("/api/check", checkHandler)
	e.GET("/api/error-rate", getErrorRate)
	e.POST("/api/set-error-rate", setErrorRate)

	e.Logger.Fatal(e.Start(":8080"))
}
