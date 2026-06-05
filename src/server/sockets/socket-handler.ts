import { Server as SocketIOServer, Socket } from "socket.io";
import { userService } from "../services/user-service";
import { roomService } from "../services/room-service";
import { chatService } from "../services/chat-service";
import { moderationService } from "../services/moderation-service";
import { redisService } from "../services/redis-service";
import { db } from "../db";
import { metricsService } from "../services/metrics-service";

export function setupSocketHandlers(io: SocketIOServer) {
  // Assinar canais Redis Pub/Sub para suporte horizontal a multi-instâncias
  redisService.subscribe("chat_messages", (payloadString) => {
    try {
      const payload = JSON.parse(payloadString);
      io.to(payload.room_id).emit("receive_message", payload);
    } catch (err) {
      console.error("Erro no Pub/Sub Redis chat_messages:", err);
    }
  });

  redisService.subscribe("chat_interactions", (payloadString) => {
    try {
      const payload = JSON.parse(payloadString);
      if (payload.hidden) {
        io.emit("message_deleted", { messageId: payload.id });
      } else {
        io.to(payload.room_id).emit("message_updated", payload);
      }
    } catch (err) {
      console.error("Erro no Pub/Sub Redis chat_interactions:", err);
    }
  });

  redisService.subscribe("room_config_updates", (payloadString) => {
    try {
      const updatedRoom = JSON.parse(payloadString);
      io.emit("room_updated", updatedRoom);
    } catch (err) {
      console.error("Erro no Pub/Sub Redis room_config_updates:", err);
    }
  });

  redisService.subscribe("user_bans", (payloadString) => {
    try {
      const payload = JSON.parse(payloadString);
      io.emit("user_banned", { userId: payload.userId });
    } catch (err) {}
  });

  redisService.subscribe("external_links_updated", (payloadString) => {
    try {
      const updatedLinks = JSON.parse(payloadString);
      io.emit("external_links_updated", updatedLinks);
    } catch (err) {
      console.error("Erro no Pub/Sub Redis external_links_updated:", err);
    }
  });

  redisService.subscribe("user_mutes", (payloadString) => {
    try {
      const payload = JSON.parse(payloadString);
      io.emit("user_muted_updated", { userId: payload.userId, status: payload.status });
    } catch (err) {}
  });

  io.on("connection", (socket: Socket) => {
    let activeUserId: string | null = null;
    let activeRoomId: string | null = null;

    // Obter IP do cliente de forma segura
    const getClientIp = (): string => {
      const forwarded = socket.handshake.headers["x-forwarded-for"];
      if (forwarded) {
        const list = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
        return list[0].trim();
      }
      return socket.handshake.address || "127.0.0.1";
    };

    const clientIp = getClientIp();

    /**
     * Autenticar socket e sincronizar dados de perfil na reconexão
     */
    socket.on("authenticate_socket", ({ userId }) => {
      if (!userId) return;

      activeUserId = userId;
      
      // Registrar conexão ativa e matar sessões ativas duplicadas do mesmo UUID
      userService.registerConnection(userId, socket.id, socket);

      // Buscar perfil atualizado e sincronizar com o cliente
      const user = userService.getOrCreateUser(userId, clientIp);
      socket.emit("auth_sync", user);
    });

    /**
     * Ação de Entrar em Sala
     */
    socket.on("join_room", ({ roomId, userId }) => {
      if (!roomId || !userId) return;

      activeUserId = userId;
      
      // Registrar métrica de acesso O(1) usando o novo serviço
      metricsService.registerAccess(roomId, clientIp, userId);

      // Garantir o registro de conexão ativa para detecção de duplicidades
      userService.registerConnection(userId, socket.id, socket);

      const user = userService.getUser(userId);
      if (user && user.status === "banned") {
        socket.emit("error_alert", { message: "Você foi banido permanentemente desta comunidade." });
        socket.disconnect(true);
        return;
      }

      // Sair de qualquer canal WebSocket anterior
      if (activeRoomId && activeRoomId !== roomId) {
        socket.leave(activeRoomId);
        roomService.leaveRoom(activeRoomId);
        const prevRoom = roomService.getRoom(activeRoomId);
        io.emit("room_user_count", { roomId: activeRoomId, count: prevRoom ? prevRoom.current_users : 0 });
      }

      activeRoomId = roomId;
      socket.join(roomId);

      try {
        // Apenas incrementar a contagem da sala de destino
        const assignedRoom = roomService.incrementRoomUsers(roomId);
        
        // Transmitir contagem de acadêmicos atualizada instantaneamente
        io.emit("room_user_count", { roomId: assignedRoom.id, count: assignedRoom.current_users });

        // Enviar histórico de cache de 50 mensagens
        const history = chatService.getMessagesForRoom(assignedRoom.id);
        socket.emit("message_history", history);
      } catch (err: any) {
        socket.emit("error_alert", { message: err.message });
      }
    });

    /**
     * Ação de Sair de Sala
     */
    socket.on("leave_room", ({ roomId }) => {
      if (roomId) {
        socket.leave(roomId);
        roomService.leaveRoom(roomId);
        const room = roomService.getRoom(roomId);
        io.emit("room_user_count", { roomId, count: room ? room.current_users : 0 });
      }
      activeRoomId = null;
    });

    /**
     * Receber e propagar nova mensagem
     */
    socket.on("send_message", ({ roomId, userId, content, replyToMessageId }) => {
      try {
        const user = userService.getUser(userId);
        if (!user) throw new Error("Usuário não cadastrado.");
        if (user.status === "banned") throw new Error("Você foi banido permanentemente.");
        if (user.status === "muted") throw new Error("Seu canal está marcado como MUTADO. Apenas leitura permitida.");

        // Anti-Flood reativo
        moderationService.checkFloodLimit(userId, user.username);

        // Adicionar mensagem
        const message = chatService.addMessage(roomId, userId, content, replyToMessageId);

        // Disparar no Pub/Sub do Redis para escalabilidade horizontal
        redisService.publish("chat_messages", message);
      } catch (error: any) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError && parsedError.type === "warning") {
            socket.emit("warning_alert", { message: parsedError.message });
            return;
          }
        } catch (e) {
          // Normal text error
        }
        socket.emit("error_alert", { message: error.message });
      }
    });

    /**
     * Interações
     */
    socket.on("like_message", ({ messageId, userId }) => {
      try {
        const updatedMessage = chatService.addInteraction(messageId, userId, clientIp, "like");
        redisService.publish("chat_interactions", updatedMessage);
      } catch (err) {}
    });

    socket.on("dislike_message", ({ messageId, userId }) => {
      try {
        const updatedMessage = chatService.addInteraction(messageId, userId, clientIp, "dislike");
        redisService.publish("chat_interactions", updatedMessage);
      } catch (err) {}
    });

    socket.on("report_message", ({ messageId, userId }) => {
      try {
        const msg = db.messagesMap.get(messageId);
        if (!msg) return;

        const updatedMessage = moderationService.reportMessage(messageId, msg.user_id, userId, clientIp);
        redisService.publish("chat_interactions", updatedMessage);

        if (updatedMessage.hidden) {
          // Registrar auditoria
          moderationService.addAuditLog(
            "delete_message",
            "AUTO-MODERADOR",
            messageId,
            `Mensagem ID ${messageId} ocultada de forma reativa por excesso de denúncias.`
          );
        }
      } catch (err: any) {
        socket.emit("error_alert", { message: err.message });
      }
    });

    /**
     * Desconexão
     */
    socket.on("disconnect", () => {
      if (activeUserId) {
        userService.removeConnection(activeUserId, socket.id);
      }
      if (activeRoomId) {
        roomService.leaveRoom(activeRoomId);
        const room = roomService.getRoom(activeRoomId);
        io.emit("room_user_count", { roomId: activeRoomId, count: room ? room.current_users : 0 });
      }
    });
  });
}
