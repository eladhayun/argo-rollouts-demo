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

// Set default API rate based on environment
const DEFAULT_API_RATE = import.meta.env.MODE === 'development' ? 2000 : 500;

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
        backgroundColor: 'rgba(255, 87, 87, 0.7)', // Bright red
      },
      {
        data: [],
        backgroundColor: 'rgba(0, 195, 255, 0.7)', // Bright blue
      },
      {
        data: [],
        backgroundColor: 'rgba(0, 255, 128, 0.7)', // Bright green
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 0, 255, 0.7)', // Magenta
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 255, 0, 0.7)', // Yellow
      },
      {
        data: [],
        backgroundColor: 'rgba(0, 255, 255, 0.7)', // Cyan
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 165, 0, 0.7)', // Orange
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 0, 128, 0.7)', // Pink
      },
      {
        data: [],
        backgroundColor: 'rgba(128, 255, 0, 0.7)', // Lime
      },
      {
        data: [],
        backgroundColor: 'rgba(255, 128, 0, 0.7)', // Deep orange
      }
    ],
  });

  const [sliderValue, setSliderValue] = useState(0); // Default slider value
  const [apiRateValue, setApiRateValue] = useState(DEFAULT_API_RATE); // Use environment-based default
  const [seenVersions, setSeenVersions] = useState(new Set()); // Track unique versions

  useEffect(() => {
    const moveInterval = setInterval(() => {
      setData((prevData) => {
        const totalBubbles = prevData.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0);

        return {
          datasets: prevData.datasets.map((dataset) => ({
            ...dataset,
            data: dataset.data
              .map((bubble) => ({
                ...bubble,
                x: bubble.x - 1, // Reduced movement per frame for smoother animation
              }))
              .filter((bubble) => bubble.x > -150 && bubble.x <= 150 && bubble.y >= -100 && bubble.y <= 100),
          })),
        };
      });
    }, 16); // ~60fps for smooth animation

    const fetchAndSpawnBubble = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/check`);
        
        if (response.status === 200) {
          const version = response.headers.get("X-Version");
          console.log(`API returned 200 with X-Version: ${version}, adding bubble.`);
          
          setSeenVersions(prev => new Set([...prev, version]));
    
          setData((prevData) => ({
            datasets: prevData.datasets.map((dataset, index) => ({
              ...dataset,
              data: index === runNumberToIndex(version)
                ? [...dataset.data, generateBubble()]
                : dataset.data,
            })),
          }));
        } else {
          console.log('API did not return 200, skipping bubble.');
        }
      } catch (error) {
        console.error('Error fetching API:', error);
      }
    };
    
    const apiInterval = setInterval(fetchAndSpawnBubble, apiRateValue);

    return () => {
      clearInterval(moveInterval);
      clearInterval(apiInterval);
    };
  }, [apiRateValue]); // Add apiRateValue as dependency

  const handleSliderChange = (event) => {
    const value = event.target.value;
    setSliderValue(value);
  };

  const handleApiRateChange = (event) => {
    const value = event.target.value;
    setApiRateValue(Number(value));
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

  // Calculate percentages for each version
  const calculateVersionPercentages = () => {
    const totalBubbles = data.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0);
    if (totalBubbles === 0) return data.datasets.map(() => 0);

    return data.datasets.map(dataset => 
      ((dataset.data.length / totalBubbles) * 100).toFixed(1)
    );
  };

  const versionPercentages = calculateVersionPercentages();
  
  // Convert seen versions to array and sort
  const sortedVersions = Array.from(seenVersions).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <Bubble options={options} data={data} />

      {/* Floating card with sliders and version stats */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '15px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '200px',
        }}
      >
        <div style={{ marginBottom: '15px' }}>
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

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            API Call Rate: {apiRateValue}ms
          </label>
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={apiRateValue}
            onChange={handleApiRateChange}
            style={{ width: '100%' }}
          />
        </div>
        
        {/* Version Statistics */}
        <div style={{ 
          borderTop: '1px solid rgba(255, 255, 255, 0.2)', 
          paddingTop: '10px',
          fontSize: '0.9em'
        }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Version Distribution:</div>
          {sortedVersions.map((version, index) => (
            <div key={version} style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginBottom: '3px',
              color: data.datasets[runNumberToIndex(version)].backgroundColor
            }}>
              <span>Version {version}:</span>
              <span>{versionPercentages[runNumberToIndex(version)]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
