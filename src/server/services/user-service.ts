import { db } from "../db";
import { User } from "../../types.ts";

export class UserService {
  // Mapa de conexões WebSocket ativas em memória: userId -> socketInstance (ou objeto com socket)
  private activeConnections = new Map<string, { socketId: string; socket: any }>();

  public getOrCreateUser(userId: string, ipAddress: string): User {
    return db.getOrCreateUser(userId, ipAddress);
  }

  public updateUsername(userId: string, newName: string): User {
    return db.updateUsername(userId, newName);
  }

  public getUser(userId: string): User | undefined {
    return db.getUser(userId);
  }

  public listUsers(): User[] {
    return db.listUsers();
  }

  public updateUserRole(userId: string, role: "user" | "moderator" | "admin" | "owner"): User {
    return db.updateUserRole(userId, role);
  }

  public updateUserStatus(userId: string, status: "active" | "muted" | "banned"): User {
    const user = db.updateUserStatus(userId, status);
    
    // Se o usuário foi banido ou silenciado, forçar desconexão ou sincronização no socket
    if (status === "banned") {
      this.disconnectUserSession(userId, "Você foi banido permanentemente desta comunidade.");
    }
    
    return user;
  }

  public banUser(userId: string, reason: string, ipAddress: string) {
    db.banUser(userId, ipAddress, reason);
    this.disconnectUserSession(userId, "Você foi banido permanentemente desta comunidade.");
  }

  public unbanUser(userId: string) {
    db.unbanUser(userId);
  }

  /**
   * Registrar conexão WebSocket de um usuário e gerenciar duplicidades
   */
  public registerConnection(userId: string, socketId: string, socket: any): void {
    const existing = this.activeConnections.get(userId);
    
    if (existing && existing.socketId !== socketId) {
      console.log(`🔌 Conexão duplicada detectada para UUID ${userId}. Desconectando sessão antiga.`);
      try {
        existing.socket.emit("error_alert", { 
          message: "Você foi desconectado pois sua conta foi acessada em outro local." 
        });
        existing.socket.disconnect(true);
      } catch (err) {
        console.error("Erro ao desconectar socket antigo duplicado:", err);
      }
    }

    this.activeConnections.set(userId, { socketId, socket });
  }

  /**
   * Remover conexão ativa
   */
  public removeConnection(userId: string, socketId: string): void {
    const conn = this.activeConnections.get(userId);
    if (conn && conn.socketId === socketId) {
      this.activeConnections.delete(userId);
    }
  }

  /**
   * Desconectar sessão de um usuário ativo
   */
  public disconnectUserSession(userId: string, message: string): void {
    const conn = this.activeConnections.get(userId);
    if (conn) {
      try {
        conn.socket.emit("error_alert", { message });
        conn.socket.disconnect(true);
      } catch (err) {
        // Ignorar erros
      }
      this.activeConnections.delete(userId);
    }
  }

  public getActiveSocket(userId: string): any | null {
    const conn = this.activeConnections.get(userId);
    return conn ? conn.socket : null;
  }
}

export const userService = new UserService();
