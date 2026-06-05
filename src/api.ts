import { getApiUrl } from "./config/env";

/**
 * Wrapper seguro para requisições fetch que automaticamente injeta a API_URL
 * garantindo compatibilidade entre ambientes locais (localhost) e produção (Render).
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  // Garante que o endpoint não acabe gerando duplicidade de barras se getApiUrl() terminar com barra.
  // Embora getApiUrl já não tenha trailing slash por convenção.
  const baseUrl = getApiUrl().replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  const targetUrl = `${baseUrl}${path}`;

  return fetch(targetUrl, options);
}
