import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  ArcElement,
  Legend,
} from 'chart.js';
import { Bubble, Pie } from 'react-chartjs-2';
import { faker } from '@faker-js/faker';
import ChartDataLabels from 'chartjs-plugin-datalabels';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Set default API rate based on environment
const DEFAULT_API_RATE = import.meta.env.MODE === 'development' ? 2000 : 500;

// Get stored values from localStorage or use defaults
const getStoredErrorRate = () => {
  const stored = localStorage.getItem('errorRate');
  return stored ? parseInt(stored) : 0;
};

const getStoredApiRate = () => {
  const stored = localStorage.getItem('apiRate');
  return stored ? parseInt(stored) : DEFAULT_API_RATE;
};

ChartJS.register(LinearScale, PointElement, Tooltip, ArcElement, Legend, ChartDataLabels);

export const options = {
  responsive: true, // Ensure the chart resizes
  maintainAspectRatio: false, // Allow full height usage
  animation: false, // Disable built-in animations
  plugins: {
    legend: { display: false }, // Hide legend
    tooltip: { enabled: false }, // Disable tooltip on hover
    datalabels: { display: false }, // Disable datalabels for bubble chart
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

const generateBubble = () => ({
  x: 150, // Start from the right
  y: faker.number.int({ min: -100, max: 100 }),
  r: faker.number.int({ min: 5, max: 20 })
});

// Map version to dataset index (0-9)
const versionToIndex = (version) => {
  // Convert version string to a number and use it to determine the dataset index
  const versionNum = parseInt(version);
  return versionNum % 2; // Use modulo 2 to alternate between two colors
};

export function App() {
  const [data, setData] = useState({
    datasets: [
      {
        data: [],
        backgroundColor: 'rgba(255, 2, 145, 0.7)', // Pink
      },
      {
        data: [],
        backgroundColor: 'rgba(0, 195, 255, 0.7)', // Blue
      }
    ],
  });

  const [sliderValue, setSliderValue] = useState(getStoredErrorRate()); // Initialize from localStorage
  const [apiRateValue, setApiRateValue] = useState(getStoredApiRate()); // Initialize from localStorage
  const [seenVersions, setSeenVersions] = useState(new Set()); // Track unique versions
  const [errorStats, setErrorStats] = useState({ total: 0, errors: 0 }); // Track error statistics

  // Set initial error rate when component mounts
  useEffect(() => {
    const initializeErrorRate = async () => {
      try {
        // First try to get the current error rate from the API
        console.log('Fetching current error rate from API...');
        const response = await fetch(`${API_BASE_URL}/api/error-rate`);
        if (response.ok) {
          const data = await response.json();
          console.log('Received current error rate from API:', data.value);
          setSliderValue(data.value);
        } else {
          // Fallback to localStorage if API call fails
          console.warn('Failed to fetch error rate from API, using localStorage value:', sliderValue);
        }
      } catch (error) {
        // Fallback to localStorage if API call fails
        console.warn('Error fetching error rate from API, using localStorage value:', error);
      }
    };

    initializeErrorRate();
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    const moveInterval = setInterval(() => {
      setData((prevData) => {
        const totalBubbles = prevData.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0);

        return {
          datasets: prevData.datasets.map((dataset) => ({
            ...dataset,
            data: dataset.data.map((bubble) => ({
              ...bubble,
              x: bubble.x - 1, // Reduced movement per frame for smoother animation
            })),
          })),
        };
      });
    }, 16); // ~60fps for smooth animation

    const fetchAndSpawnBubble = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/check`);
        
        setErrorStats(prev => ({ total: prev.total + 1, errors: prev.errors + (response.status !== 200 ? 1 : 0) }));
        
        // Get version from headers regardless of status code
        const version = response.headers.get("X-Version");

        if (!version) {
          console.error('No version header found in response');
          return;
        }

        if (version) {
          console.log(`API returned ${response.status} with X-Version: ${version}`);
          setSeenVersions(prev => new Set([...prev, version]));
        }
        
        setData((prevData) => ({
          datasets: prevData.datasets.map((dataset, index) => ({
            ...dataset,
            data: index === versionToIndex(version)
              ? [...dataset.data, generateBubble()]
              : dataset.data,
          })),
        }));
      } catch (error) {
        console.error('Error fetching and spawning bubble:', error);
      }
    };
    
    const apiInterval = setInterval(fetchAndSpawnBubble, apiRateValue);

    return () => {
      clearInterval(moveInterval);
      clearInterval(apiInterval);
    };
  }, [apiRateValue]); // Add apiRateValue as dependency

  // Filter bubbles for display only
  const getVisibleBubbles = (dataset) => {
    return dataset.data
      .filter((bubble) => {
        // Keep only bubbles that are in view
        return bubble.x > -150 && bubble.x <= 150 && bubble.y >= -100 && bubble.y <= 100;
      })
      .slice(-100); // Keep only the last 100 visible bubbles
  };

  const handleSliderChange = (event) => {
    const value = event.target.value;
    setSliderValue(value);
    localStorage.setItem('errorRate', value);
  };

  const handleApiRateChange = (event) => {
    const value = event.target.value;
    setApiRateValue(Number(value));
    localStorage.setItem('apiRate', value);
  };

  const handleSliderSet = async (event) => {
    const value = event.target.value;
    console.log(`Setting error rate to ${value}%`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/set-error-rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(value) }),
      });

      if (!response.ok) {
        console.error('Failed to set error rate:', value, 'Response:', response.status);
      } else {
        console.log('Successfully set error rate to:', value);
      }
    } catch (error) {
      console.error('Error setting error rate:', error);
    }
  }

  // Calculate percentages for each version based on chart data
  const calculateVersionPercentages = () => {
    const totalBubbles = data.datasets.reduce((sum, dataset) => sum + dataset.data.length, 0);
    if (totalBubbles === 0) return ['0.0', '0.0'];

    const sortedVersions = Array.from(seenVersions).sort((a, b) => parseInt(a) - parseInt(b));
    const lastTwoVersions = sortedVersions.slice(-2);
    
    console.log('Total bubbles:', totalBubbles);
    console.log('Last two versions:', lastTwoVersions);
    console.log('Dataset lengths:', data.datasets.map(d => d.data.length));
    
    // If we only have one version, return [100, 0] or [0, 100] depending on which dataset it's in
    if (lastTwoVersions.length === 1) {
      const version = lastTwoVersions[0];
      const datasetIndex = versionToIndex(version);
      const count = data.datasets[datasetIndex].data.length;
      const percentage = ((count / totalBubbles) * 100).toFixed(1);
      console.log(`Single version ${version} (dataset ${datasetIndex}): ${count} bubbles = ${percentage}%`);
      return datasetIndex === 0 ? [percentage, '0.0'] : ['0.0', percentage];
    }
    
    // For multiple versions, calculate percentages for both datasets
    const percentages = ['0.0', '0.0'];
    lastTwoVersions.forEach(version => {
      const datasetIndex = versionToIndex(version);
      const count = data.datasets[datasetIndex].data.length;
      const percentage = ((count / totalBubbles) * 100).toFixed(1);
      console.log(`Version ${version} (dataset ${datasetIndex}): ${count} bubbles = ${percentage}%`);
      percentages[datasetIndex] = percentage;
    });
    
    console.log('Final percentages:', percentages);
    return percentages;
  };

  const versionPercentages = calculateVersionPercentages();
  
  // Convert seen versions to array and sort
  const sortedVersions = Array.from(seenVersions).sort((a, b) => parseInt(a) - parseInt(b));

  const pieChartData = {
    labels: ['Successful', 'Failed'],
    datasets: [
      {
        label: 'Error Rate Distribution',
        data: [
          errorStats.total - errorStats.errors,
          errorStats.errors
        ],
        backgroundColor: [
          'rgba(8, 118, 23, 0.3)',
          'rgba(255, 87, 87, 0.3)',
        ],
        borderColor: [
          'rgba(70, 219, 90, 0.7)',
          'rgba(255, 87, 87, 0.7)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: 'white',
          padding: 20,
          font: {
            size: 12
          },
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8
        }
      },
      tooltip: {
        enabled: false,
        callbacks: {
          label: function(context) {
            const value = context.raw;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${context.label}: ${value} (${percentage}%)`;
          }
        }
      },
      datalabels: {
        color: 'white',
        font: {
          weight: 'bold',
          size: 12
        },
        formatter: (value, context) => {
          const total = context.dataset.data.reduce((a, b) => a + b, 0);
          const percentage = Math.round((value / total) * 100);
          return `${percentage}%`;
        }
      }
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <Bubble 
        options={options} 
        data={{
          datasets: data.datasets.map(dataset => ({
            ...dataset,
            data: getVisibleBubbles(dataset)
          }))
        }} 
      />

      {/* Floating card with sliders and version stats */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '15px',
          background: 'rgba(0, 0, 0,r 0.7)',
          color: 'white',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '200px',
        }}
      >
        <div style={{ marginBottom: '15px' }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>API Call Rate:</div>
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={apiRateValue}
            onChange={handleApiRateChange}
            style={{ width: '100%' }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: '3px',
            fontSize: '0.9em',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            <span>{apiRateValue}ms</span>
          </div>
        </div>

        {/* Version Statistics */}
        <div style={{ 
          borderTop: '1px solid rgba(255, 255, 255, 0.2)', 
          paddingTop: '10px',
          fontSize: '0.9em'
        }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Version Distribution:</div>
          {sortedVersions.length > 0 ? (
            <div style={{ 
              height: '150px',
              position: 'relative',
              marginBottom: '10px'
            }}>
              <Pie 
                data={{
                  labels: Array.from(seenVersions)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .slice(-2), // Only take the last two versions
                  datasets: [{
                    data: Array.from(seenVersions)
                      .sort((a, b) => parseInt(a) - parseInt(b))
                      .slice(-2) // Only take the last two versions
                      .map(version => {
                        const datasetIndex = versionToIndex(version);
                        return data.datasets[datasetIndex].data.length;
                      }),
                    backgroundColor: Array.from(seenVersions)
                      .sort((a, b) => parseInt(a) - parseInt(b))
                      .slice(-2) // Only take the last two versions
                      .map(version => {
                        const datasetIndex = versionToIndex(version);
                        return data.datasets[datasetIndex].backgroundColor;
                      }),
                    borderColor: Array.from(seenVersions)
                      .sort((a, b) => parseInt(a) - parseInt(b))
                      .slice(-2) // Only take the last two versions
                      .map(version => {
                        const datasetIndex = versionToIndex(version);
                        return data.datasets[datasetIndex].backgroundColor.replace('0.7', '1');
                      }),
                    borderWidth: 0,
                  }]
                }} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    tooltip: {
                      enabled: false,
                    },
                    legend: {
                      display: true,
                      position: 'bottom',
                      labels: {
                        color: 'white',
                        padding: 20,
                        font: {
                          size: 12
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        boxHeight: 8
                      }
                    },
                    datalabels: {
                      color: 'white',
                      font: {
                        weight: 'bold',
                        size: 12
                      },
                      formatter: (value, context) => {
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / total) * 100);
                        return `${percentage}%`;
                      }
                    }
                  }
                }} 
              />
            </div>
          ) : (
            <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>No versions detected</div>
          )}
        </div>

      </div>
    </div>
  );
}
