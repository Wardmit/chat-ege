import { db } from "../db";
import { AuditLog } from "../../types.ts";
import { userService } from "./user-service";

export class ModerationService {
  // Rastreamento de flood em memória: userId -> timestamps das últimas mensagens
  private userMessageHistory = new Map<string, number[]>();

  public getAuditLogs(): AuditLog[] {
    return db.getAuditLogs();
  }

  public addAuditLog(
    action: "delete_message" | "ban_user" | "mute_user" | "unban_user" | "update_room" | "promote_moderator" | "demote_moderator" | "report_created" | "report_ignored",
    operator: string,
    targetId: string,
    details: string
  ): void {
    db.addAuditLog(action, operator, targetId, details);
  }

  /**
   * Verificar se o usuário está enviando mensagens muito rápido (Flood)
   * Se enviar 3 ou mais mensagens em 5 segundos, silencia o usuário por 30 segundos.
   */
  public checkFloodLimit(userId: string, username: string): void {
    const now = Date.now();
    const timestamps = this.userMessageHistory.get(userId) || [];
    
    // Limpar timestamps mais antigos que 5 segundos
    const recentTimestamps = timestamps.filter(t => now - t < 5000);
    
    if (recentTimestamps.length >= 3) {
      userService.updateUserStatus(userId, "muted");
      
      // Registrar log na auditoria administrativa
      this.addAuditLog(
        "mute_user",
        "SISTEMA",
        userId,
        `Usuário ${username} silenciado automaticamente por 30 segundos devido a excesso de envio (flood).`
      );

      // Tentar emitir o estado de silenciado imediatamente para o socket ativo do usuário
      const socket = userService.getActiveSocket(userId);
      if (socket) {
        socket.emit("user_muted_updated", { userId, status: "muted" });
      }

      // Agendar reativação automática do status de escrita após 30 segundos
      setTimeout(() => {
        try {
          const user = userService.getUser(userId);
          if (user && user.status === "muted") {
            userService.updateUserStatus(userId, "active");
            this.addAuditLog(
              "unban_user",
              "SISTEMA",
              userId,
              `Silenciamento automático do usuário ${username} expirado após 30 segundos.`
            );
            
            const activeSocket = userService.getActiveSocket(userId);
            if (activeSocket) {
              activeSocket.emit("user_muted_updated", { userId, status: "active" });
            }
          }
        } catch (err) {
          console.error("Erro ao remover mute automático de flood:", err);
        }
      }, 30000); // 30 segundos de penalidade

      throw new Error("Anti-spam: Você foi silenciado temporariamente por 30 segundos devido ao envio excessivo de mensagens (flood).");
    }

    recentTimestamps.push(now);
    this.userMessageHistory.set(userId, recentTimestamps);
  }

  // Rate Limiter for reports (max 5 per minute)
  private userReportHistory = new Map<string, number[]>();

  public reportMessage(messageId: string, reportedUserId: string, reporterUserId: string, ipAddress: string) {
    const now = Date.now();
    const timestamps = this.userReportHistory.get(reporterUserId) || [];
    const recentTimestamps = timestamps.filter(t => now - t < 60000); // 1 minuto
    
    if (recentTimestamps.length >= 5) {
      throw new Error("Muitas denúncias! Aguarde 1 minuto para denunciar novamente.");
    }
    
    // Check if user is active? The frontend limits who can report, but we also rely on DB logic
    const msg = db.addInteraction(messageId, reporterUserId, ipAddress, "report");

    recentTimestamps.push(now);
    this.userReportHistory.set(reporterUserId, recentTimestamps);

    this.addAuditLog(
      "report_created",
      reporterUserId,
      messageId,
      `Usuário denunciou a mensagem de ${reportedUserId}.`
    );

    return msg;
  }

  public ignoreReport(messageId: string, operator: string) {
    const msg = db.getReportedMessages().find(m => m.id === messageId);
    if (!msg) throw new Error("Mensagem denunciada não encontrada.");

    msg.reports_count = 0;
    msg.moderation_status = "ignored";
    msg.hidden = false;
    db.save();

    this.addAuditLog(
      "report_ignored",
      operator,
      messageId,
      "Denúncia ignorada pelo moderador/admin."
    );

    return msg;
  }

  // --- PROGRESSIVE PUNISHMENT SYSTEM ---
  public onWarn(userId: string, username: string): { type: "warning"; message: string } | null {
    const user = userService.getUser(userId);
    if (!user) return null;

    user.warnCount = (user.warnCount || 0) + 1;
    user.lastWarnAt = Date.now();
    db.save();

    this.addAuditLog(
      "mute_user",
      "SISTEMA",
      userId,
      `Usuário ${username} recebeu uma advertência (Total: ${user.warnCount}).`
    );

    const warnCount = user.warnCount;
    
    // Apply progressive punishments
    if (warnCount >= 10) {
      userService.updateUserStatus(userId, "banned");
      const socket = userService.getActiveSocket(userId);
      if (socket) {
        socket.emit("user_banned", { reason: "Múltiplas infrações reincidentes." });
        socket.disconnect(true);
      }
      this.addAuditLog("ban_user", "SISTEMA", userId, `Banimento automático (24h) por 10 advertências.`);
      // Can schedule unban after 24h or handle it in a cron
    } else if (warnCount === 8) {
      this.applyTemporaryMute(userId, username, 15);
    } else if (warnCount === 5) {
      this.applyTemporaryMute(userId, username, 5);
    } else if (warnCount === 3) {
      return {
        type: "warning",
        message: "⚠️ Você acumulou 3 avisos por vocabulário impróprio. Mais infrações resultarão em punições."
      };
    }

    return null; // For 1, 2, 4, 6, 7, 9 -> just silent count update
  }

  private applyTemporaryMute(userId: string, username: string, minutes: number) {
    userService.updateUserStatus(userId, "muted");
    
    this.addAuditLog(
      "mute_user",
      "SISTEMA",
      userId,
      `Silenciamento automático por ${minutes} minutos.`
    );

    const socket = userService.getActiveSocket(userId);
    if (socket) {
      socket.emit("user_muted_updated", { userId, status: "muted", reason: `Advertências acumuladas. Mutado por ${minutes} minutos.` });
    }

    setTimeout(() => {
      try {
        const user = userService.getUser(userId);
        if (user && user.status === "muted") {
          userService.updateUserStatus(userId, "active");
          const activeSocket = userService.getActiveSocket(userId);
          if (activeSocket) {
            activeSocket.emit("user_muted_updated", { userId, status: "active" });
          }
        }
      } catch (err) {}
    }, minutes * 60 * 1000);
  }
}

export const moderationService = new ModerationService();
