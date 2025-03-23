import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  ArcElement,
} from 'chart.js';
import { Bubble, Pie } from 'react-chartjs-2';
import { faker } from '@faker-js/faker';

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

ChartJS.register(LinearScale, PointElement, Tooltip, ArcElement);

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

const generateBubble = () => ({
  x: 150, // Start from the right
  y: faker.number.int({ min: -100, max: 100 }),
  r: faker.number.int({ min: 5, max: 20 })
});

// Map run number to dataset index (0-9)
const runNumberToIndex = (runNumber) => {
  return (parseInt(runNumber) - 1) % 2; // Subtract 1 because run numbers start at 1
};

export function App() {
  const [data, setData] = useState({
    datasets: [
      {
        data: [],
        backgroundColor: 'rgba(255, 2, 145, 0.7)',
      },
      {
        data: [],
        backgroundColor: 'rgba(0, 195, 255, 0.7)',
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

      // Set the error rate on the backend
      try {
        console.log('Setting initial error rate on backend:', sliderValue);
        const response = await fetch(`${API_BASE_URL}/api/set-error-rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: Number(sliderValue) }),
        });

        if (!response.ok) {
          console.error('Failed to set initial error rate:', sliderValue, 'Response:', response.status);
        } else {
          console.log('Successfully set initial error rate:', sliderValue);
        }
      } catch (error) {
        console.error('Error setting initial error rate:', error);
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
        
        if (response.status === 200) {
          setData((prevData) => ({
            datasets: prevData.datasets.map((dataset, index) => ({
              ...dataset,
              data: index === runNumberToIndex(version)
                ? [...dataset.data, generateBubble()]
                : dataset.data,
            })),
          }));
        } else {
          setData((prevData) => ({
            datasets: prevData.datasets.map((dataset, index) => ({
              ...dataset,
              data: index === runNumberToIndex(version)
                ? [...dataset.data, generateBubble()]
                : dataset.data,
            })),
          }));
        }
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
      const datasetIndex = runNumberToIndex(version);
      const count = data.datasets[datasetIndex].data.length;
      const percentage = ((count / totalBubbles) * 100).toFixed(1);
      console.log(`Single version ${version} (dataset ${datasetIndex}): ${count} bubbles = ${percentage}%`);
      return datasetIndex === 0 ? [percentage, '0.0'] : ['0.0', percentage];
    }
    
    // For multiple versions, calculate percentages for both datasets
    const percentages = ['0.0', '0.0'];
    lastTwoVersions.forEach(version => {
      const datasetIndex = runNumberToIndex(version);
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
        data: [
          errorStats.total - errorStats.errors,
          errorStats.errors
        ],
        backgroundColor: [
          'rgba(0, 195, 255, 0.7)',  // Blue for successful
          'rgba(255, 87, 87, 0.7)',  // Red for failed
        ],
        borderColor: [
          'rgba(0, 195, 255, 1)',
          'rgba(255, 87, 87, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: 'white',
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: function(context) {
            const value = context.raw;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${context.label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

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

        <div style={{ marginBottom: '15px' }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Error Rate:</div>
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={handleSliderChange}
            onMouseUp={handleSliderSet}
            style={{ width: '100%' }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: '3px',
            fontSize: '0.9em',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            <span>{sliderValue}%</span>
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
            sortedVersions.slice(-2).map((version) => {
              const datasetIndex = runNumberToIndex(version);
              return (
                <div key={version} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '3px',
                  color: data.datasets[datasetIndex].backgroundColor
                }}>
                  <span>{datasetIndex === 0 ? 'Stable' : 'Canary'}:</span>
                  <span>{versionPercentages[datasetIndex]}%</span>
                </div>
              );
            })
          ) : (
            <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>No versions detected</div>
          )}
          <div style={{ 
            borderTop: '1px solid rgba(255, 255, 255, 0.2)', 
            marginTop: '10px',
            paddingTop: '10px'
          }}>
            <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Error Rate:</div>
            <div style={{ 
              height: '150px',
              position: 'relative',
              marginBottom: '10px'
            }}>
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8em',
              color: 'rgba(255, 255, 255, 0.7)'
            }}>
              <span>Total Calls: {errorStats.total}</span>
              <span>Failed: {errorStats.errors}</span>
              <span>{errorStats.total > 0 ? ((errorStats.errors / errorStats.total) * 100).toFixed(1) : '0'}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
