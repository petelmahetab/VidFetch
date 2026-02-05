import axios from 'axios';

const fallenApiClient = axios.create({
  baseURL: process.env.FALLEN_API_BASE_URL?.trim(),
  timeout: 10000,
  headers: {
    'X-API-Key': process.env.FALLEN_API_KEY,  
    'Content-Type': 'application/json'
  }
});

fallenApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('FallenAPI Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default fallenApiClient;