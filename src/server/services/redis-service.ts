import { EventEmitter } from "events";
import Redis from "ioredis";

class RedisService {
  private pubClient: any = null;
  private subClient: any = null;
  private isConnected: boolean = false;
  private memoryPubSub = new EventEmitter();
  private memoryCache = new Map<string, { value: any; expiry: number }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    const useRedis = process.env.USE_REDIS === "true" || !!process.env.REDIS_URL;

    if (useRedis && Redis) {
      try {
        this.pubClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 2000
        });
        
        this.subClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 2000
        });

        const handleError = (err: any) => {
          console.warn("⚠️ Redis não pôde se conectar. Usando fallback em memória local de alto desempenho:", err.message);
          this.isConnected = false;
        };

        this.pubClient.on("error", handleError);
        this.subClient.on("error", handleError);

        this.pubClient.on("connect", () => {
          this.isConnected = true;
          console.log("⚡ Conexão com Redis estabelecida com sucesso (Pub/Sub + Cache ativos).");
        });
      } catch (err) {
        console.warn("⚠️ Falha ao instanciar clientes Redis. Utilizando fallback local.");
        this.isConnected = false;
      }
    } else {
      console.log("ℹ️ Redis não configurado ou USE_REDIS desativado. Inicializando fallback local em memória.");
    }
  }

  /**
   * Publicar evento no Pub/Sub
   */
  public async publish(channel: string, message: any): Promise<void> {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    if (this.isConnected && this.pubClient) {
      try {
        await this.pubClient.publish(channel, payload);
        return;
      } catch (err) {
        // Falhou, usa fallback
      }
    }
    // Fallback em memória
    this.memoryPubSub.emit(channel, payload);
  }

  /**
   * Assinar canal no Pub/Sub
   */
  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (this.isConnected && this.subClient) {
      try {
        await this.subClient.subscribe(channel);
        this.subClient.on("message", (chan: string, msg: string) => {
          if (chan === channel) {
            callback(msg);
          }
        });
        return;
      } catch (err) {
        // Falhou, usa fallback
      }
    }
    // Fallback em memória
    this.memoryPubSub.on(channel, callback);
  }

  /**
   * Armazenar no Cache (com TTL opcional)
   */
  public async setCache(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    
    if (this.isConnected && this.pubClient) {
      try {
        if (ttlSeconds) {
          await this.pubClient.set(key, payload, "EX", ttlSeconds);
        } else {
          await this.pubClient.set(key, payload);
        }
        return;
      } catch (err) {
        // Fallback
      }
    }

    // Cache local em memória
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.memoryCache.set(key, { value: payload, expiry });
  }

  /**
   * Obter valor do cache
   */
  public async getCache<T = any>(key: string): Promise<T | null> {
    if (this.isConnected && this.pubClient) {
      try {
        const cached = await this.pubClient.get(key);
        if (cached) {
          try {
            return JSON.parse(cached) as T;
          } catch {
            return cached as unknown as T;
          }
        }
        return null;
      } catch (err) {
        // Fallback
      }
    }

    // Cache local em memória
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (Date.now() > cached.expiry) {
        this.memoryCache.delete(key);
        return null;
      }
      try {
        return JSON.parse(cached.value) as T;
      } catch {
        return cached.value as unknown as T;
      }
    }
    return null;
  }

  /**
   * Deletar do cache
   */
  public async deleteCache(key: string): Promise<void> {
    if (this.isConnected && this.pubClient) {
      try {
        await this.pubClient.del(key);
        return;
      } catch (err) {
        // Fallback
      }
    }
    this.memoryCache.delete(key);
  }
}

export const redisService = new RedisService();
