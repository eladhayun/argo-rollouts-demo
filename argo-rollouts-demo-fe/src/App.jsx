import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';
import { faker } from '@faker-js/faker';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

ChartJS.register(LinearScale, PointElement, Tooltip);

export const options = {
  responsive: true, // Ensure the chart resizes
  maintainAspectRatio: false, // Allow full height usage
  animation: false, // Disable built-in animations
  plugins: {
    legend: { display: false }, // Hide legend
    tooltip: { enabled: false }, // Disable tooltip on hover
  },
  elements: {
    point: {
      hoverRadius: 0, // Disable hover effects
    },
  },
  scales: {
    x: { min: -150, max: 150, display: false }, // Hide X-axis labels
    y: { min: -100, max: 100, display: false }, // Hide Y-axis labels
  },
};

const generateBubble = (color) => ({
  x: 150, // Start from the right
  y: faker.number.int({ min: -100, max: 100 }),
  r: faker.number.int({ min: 5, max: 20 }),
});

// Map run number to dataset index (0-9)
const runNumberToIndex = (runNumber) => {
  return (parseInt(runNumber) - 1) % 10; // Subtract 1 because run numbers start at 1
};

export function App() {
  const [data, setData] = useState({
    datasets: [
      {
        data: [],
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(50, 205, 50, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 206, 86, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(153, 102, 255, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(201, 203, 207, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 99, 71, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
      {
        data: [],
        backgroundColor: 'rgba(147, 112, 219, 0.5)',
      }
    ],
  });

  const [sliderValue, setSliderValue] = useState(0); // Default slider value

  useEffect(() => {
    const moveInterval = setInterval(() => {
      setData((prevData) => {
        // First, count total bubbles across all datasets for debugging
        const totalBubbles = prevData.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0);

        return {
          datasets: prevData.datasets.map((dataset) => ({
            ...dataset,
            data: dataset.data
              .map((bubble) => ({
                ...bubble,
                x: bubble.x - 2, // Move left
              }))
              // More aggressive filtering - remove bubbles that are clearly off-screen
              .filter((bubble) => bubble.x > -150 && bubble.x <= 150 && bubble.y >= -100 && bubble.y <= 100),
          })),
        };
      });
    }, 50);

    const fetchAndSpawnBubble = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/check`);
        
        if (response.status === 200) {
          const version = response.headers.get("X-Version"); // Read header value
          console.log(`API returned 200 with X-Version: ${version}, adding bubble.`);
    
          setData((prevData) => ({
            datasets: prevData.datasets.map((dataset, index) => ({
              ...dataset,
              data: index === runNumberToIndex(version)
                ? [...dataset.data, generateBubble()] // Add to matching dataset
                : dataset.data, // No change
            })),
          }));
        } else {
          console.log('API did not return 200, skipping bubble.');
        }
      } catch (error) {
        console.error('Error fetching API:', error);
      }
    };
    

    const apiInterval = setInterval(fetchAndSpawnBubble, 500);

    return () => {
      clearInterval(moveInterval);
      clearInterval(apiInterval);
    };
  }, []);

  const handleSliderChange = (event) => {
    const value = event.target.value;
    setSliderValue(value);
  };

  const handleSliderSet = async (event) => {
    const value = event.target.value;
    try {
      const response = await fetch(`${API_BASE_URL}/api/set-error-rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(value) }),
      });

      if (!response.ok) {
        console.error('Failed to send value:', value);
      } else {
        console.log('Successfully sent value:', value);
      }
    } catch (error) {
      console.error('Error sending value:', error);
    }
  }

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}> {/* Full height canvas */}
      <Bubble options={options} data={data} />

      {/* Floating card with slider */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          padding: '15px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '200px',
        }}
      >
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Error Rate: {sliderValue}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={sliderValue}
          onChange={handleSliderChange}
          onMouseUp={handleSliderSet}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
