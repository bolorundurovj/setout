// Development configuration. ng serve runs on its own port, so point the SDK at
// the API directly. The backend enables CORS for local development.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8474',
};
