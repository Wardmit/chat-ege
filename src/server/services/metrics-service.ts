import { firestoreService } from "./firestore-service.ts";
import { db } from "../db.ts";
import { roomService } from "./room-service.ts";

export class MetricsService {
  // roomId -> (date -> Set<ip>)
  private roomAccessCache = new Map<string, Map<string, Set<string>>>();
  private isDirty = false;

  constructor() {
    // Iniciar flush interval a cada 60s
    setInterval(() => this.flushToDB(), 60000);
  }

  public registerAccess(roomId: string, ip: string, userId: string) {
    if (!roomId || !ip || !userId) return;
    
    // Obter data atual no formato YYYY-MM-DD
    const date = new Date().toISOString().split("T")[0];
    const compositeKey = `${ip}_${userId}`;

    let roomCache = this.roomAccessCache.get(roomId);
    if (!roomCache) {
      roomCache = new Map<string, Set<string>>();
      this.roomAccessCache.set(roomId, roomCache);
    }

    let dateCache = roomCache.get(date);
    if (!dateCache) {
      dateCache = new Set<string>();
      roomCache.set(date, dateCache);
    }

    if (!dateCache.has(compositeKey)) {
      dateCache.add(compositeKey);
      this.isDirty = true;
    }
  }

  public flushToDB() {
    if (!this.isDirty) return;

    // Garantir que a estrutura inicial no db.ts exista
    if (!db.roomAccessStats) {
      db.roomAccessStats = {};
    }

    const todayObj = new Date();
    // Limitar histórico a 7 dias
    const minDate = new Date(todayObj.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Mesclar o cache na persistência (db.roomAccessStats)
    for (const [roomId, dateMap] of this.roomAccessCache.entries()) {
      if (!db.roomAccessStats[roomId]) {
        db.roomAccessStats[roomId] = {};
      }

      for (const [date, ipSet] of dateMap.entries()) {
        if (!db.roomAccessStats[roomId][date]) {
          db.roomAccessStats[roomId][date] = [];
        }
        
        // Evitar array gigante: usar Set temporário para unir os dados
        const mergedSet = new Set(db.roomAccessStats[roomId][date]);
        for (const ip of ipSet) {
          mergedSet.add(ip);
        }
        db.roomAccessStats[roomId][date] = Array.from(mergedSet);
      }

      // TTL (remover datas antigas)
      for (const date of Object.keys(db.roomAccessStats[roomId])) {
        if (date < minDate) {
          delete db.roomAccessStats[roomId][date];
        }
      }
      
      // Remover salas antigas sem dados
      if (Object.keys(db.roomAccessStats[roomId]).length === 0) {
        delete db.roomAccessStats[roomId];
      }
    }

    // Persistência isolada: Salva apenas essa métrica via throttle
    firestoreService.saveConfig("roomAccessStats", { stats: db.roomAccessStats });

    // Limpar cache local (isDirty flag) e recomeçar
    // Nota: Nós não zeramos o roomAccessCache porque a unicidade O(1) depende de sabermos quais IPs já entraram hoje.
    // Mas desmarcamos a flag de dirty.
    this.isDirty = false;
  }

  public getStats(roomId: string) {
    // Não disparamos flushToDB aqui para não escrever desnecessariamente a cada leitura do admin.
    // Combinamos a persistência + cache em memória em tempo real.

    const persistedStats = (db.roomAccessStats || {})[roomId] || {};
    const cachedStats = this.roomAccessCache.get(roomId);
    
    // Unificar chaves de datas
    const allDates = new Set<string>(Object.keys(persistedStats));
    if (cachedStats) {
      for (const date of cachedStats.keys()) {
        allDates.add(date);
      }
    }
    
    const dateKeys = Array.from(allDates).sort();
    
    let today = 0;
    let last7days = 0;
    const daily = [];

    const todayDate = new Date().toISOString().split("T")[0];

    for (const date of dateKeys) {
      // Unir IPs do banco + cache para deduplicação final
      const mergedSet = new Set<string>(persistedStats[date] || []);
      const cacheForDate = cachedStats?.get(date);
      if (cacheForDate) {
        for (const item of cacheForDate) {
          mergedSet.add(item);
        }
      }
      
      const count = mergedSet.size;
      last7days += count;
      if (date === todayDate) {
        today += count;
      }
      daily.push({ date, count });
    }

    return {
      today,
      last7days,
      daily
    };
  }

  public getTopRoomsToday(limit: number = 10) {
    const todayDate = new Date().toISOString().split("T")[0];
    
    // Obter todas as salas possíveis do banco e do cache
    const roomIds = new Set<string>();
    
    if (db.roomAccessStats) {
      for (const roomId of Object.keys(db.roomAccessStats)) {
        roomIds.add(roomId);
      }
    }
    for (const roomId of this.roomAccessCache.keys()) {
      roomIds.add(roomId);
    }

    const ranking: { roomId: string; roomName: string; count: number }[] = [];

    for (const roomId of roomIds) {
      const persistedSet = new Set<string>((db.roomAccessStats?.[roomId]?.[todayDate]) || []);
      
      const cachedForRoom = this.roomAccessCache.get(roomId);
      if (cachedForRoom && cachedForRoom.has(todayDate)) {
        const cacheSet = cachedForRoom.get(todayDate)!;
        for (const item of cacheSet) {
          persistedSet.add(item);
        }
      }
      
      const count = persistedSet.size;
      
      if (count > 0) {
        const room = roomService.getRoom(roomId);
        ranking.push({
          roomId,
          roomName: room?.name || `Sala Excluída (${roomId.slice(0, 5)}...)`,
          count
        });
      }
    }

    // Ordenar DESC (maior -> menor) e pegar top N
    ranking.sort((a, b) => b.count - a.count);
    return ranking.slice(0, limit);
  }
}

export const metricsService = new MetricsService();
