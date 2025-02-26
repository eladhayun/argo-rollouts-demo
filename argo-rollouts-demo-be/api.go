package main

import (
	"encoding/json"
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
	version   = "1" // Default version is "1"
)

func checkHandler(c echo.Context) error {
	mu.Lock()
	currentErrorRate := errorRate
	mu.Unlock()

	// Determine if the response should be an error (400) based on errorRate
	statusCode := http.StatusOK
	if rand.Float64() < currentErrorRate {
		statusCode = http.StatusBadRequest
	}

	// Set X-Version header
	c.Response().Header().Set("X-Version", version)
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

func main() {
	rand.Seed(time.Now().UnixNano())

	// Get version from ENV (default to "1")
	if v := os.Getenv("VERSION"); v == "2" {
		version = "2"
	}

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	e.GET("/api/check", checkHandler)
	e.POST("/api/set-error-rate", setErrorRate)

	e.Logger.Fatal(e.Start(":8080"))
}
