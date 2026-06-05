export const ENV = {
  // O Vite expõe variáveis via import.meta.env
  MODE: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE : 'development',
  IS_PRODUCTION: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE === 'production' : false,
};

// Se não houver import.meta.env (ex: ambiente Node.js), recai para development fallback
const isProd = ENV.IS_PRODUCTION;

// Variáveis centrais (Evite usar trailing slashes "/")
const envApiUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : undefined;

export const API_URL = envApiUrl || (isProd
  ? "https://chat-ege.onrender.com"
  : "http://localhost:3000");

export const SOCKET_URL = envApiUrl || (isProd
  ? "https://chat-ege.onrender.com"
  : "http://localhost:3000");

export const APP_URL = isProd
  ? "https://chat-ege.web.app"
  : "http://localhost:5173";

// Helpers estritos
export const getApiUrl = () => API_URL;
export const getSocketUrl = () => SOCKET_URL;
export const getAppUrl = () => APP_URL;
