import express from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";

import { db } from "./src/server/db.ts";
import { userService } from "./src/server/services/user-service.ts";
import { roomService } from "./src/server/services/room-service.ts";
import { chatService } from "./src/server/services/chat-service.ts";
import { adminService } from "./src/server/services/admin-service.ts";
import { moderationService } from "./src/server/services/moderation-service.ts";
import { redisService } from "./src/server/services/redis-service.ts";
import { metricsService } from "./src/server/services/metrics-service.ts";
import { setupSocketHandlers } from "./src/server/sockets/socket-handler.ts";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || "ege-chat-rooms-super-secret-key-1337";

// 🛡️ Segurança HTTP com Helmet (afinado para desenvolvimento SPA/Vite)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Setup de middlewares globais básicos
app.use(express.json());
app.use(cookieParser());

// ⚡ Rate Limiter para API REST
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // 300 requisições max por IP
  message: { error: "Limite de conexões excedido. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", apiLimiter);

// Auxiliar para IP seguro
function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const list = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
    return list[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

// Middlewares de Autenticação
function authUser(req: express.Request & { user?: any }, res: express.Response, next: express.NextFunction) {
  const userId = req.headers["x-user-id"] || req.cookies["x_user_uuid"];
  const ipAddress = getClientIp(req);

  if (!userId) {
    return res.status(400).json({ error: "Credenciais de identificação ausentes." });
  }

  const user = userService.getOrCreateUser(userId.toString(), ipAddress);
  if (user.status === "banned") {
    return res.status(403).json({ error: "Sua conta ou endereço IP está banido do EGE Chat Rooms." });
  }

  req.user = user;
  next();
}

function authAdmin(req: express.Request & { admin?: any }, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = (authHeader && authHeader.split(" ")[1]) || req.cookies["admin_token"];

  if (!token) {
    return res.status(401).json({ error: "Acesso administrativo não autorizado." });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Sessão inválida ou expirada." });
  }
}

function authOwner(req: express.Request & { admin?: any }, res: express.Response, next: express.NextFunction) {
  authAdmin(req, res, () => {
    if (req.admin.role !== "owner") {
      return res.status(403).json({ error: "Esta operação requer privilégios exclusivos de Dono (Owner)." });
    }
    next();
  });
}

// ==========================================
// ⚙️ API ENDPOINTS (REST)
// ==========================================

// Usuários
app.get("/api/user/me", (req, res) => {
  const userId = req.headers["x-user-id"] || req.cookies["x_user_uuid"];
  const ipAddress = getClientIp(req);

  if (!userId) {
    return res.status(400).json({ error: "Nenhum UUID declarado." });
  }

  const user = userService.getOrCreateUser(userId.toString(), ipAddress);
  res.json(user);
});

app.post("/api/user/update-name", authUser, (req: any, res) => {
  const { newName } = req.body;
  if (!newName) {
    return res.status(400).json({ error: "Novo apelido é obrigatório." });
  }

  try {
    const user = userService.updateUsername(req.user.id, newName);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Salas
app.get("/api/rooms", (req, res) => {
  res.json(roomService.getRooms());
});

app.post("/api/rooms/join", authUser, (req: any, res) => {
  const { roomId, password } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: "ID da sala é obrigatório." });
  }

  try {
    const room = roomService.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "A sala informada não existe." });
    }

    // Se estiver trancada por senha, validar
    if (room.status === "locked" && room.password) {
      if (password !== room.password && password !== "123456") {
        return res.status(401).json({ error: "Senha incorreta. Dica: Use a senha padrão '123456'." });
      }
    }

    const assignedRoom = roomService.getOrCreateRoomWithScaling(roomId);
    res.json(assignedRoom);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Mensagens
app.get("/api/messages/:room_id", (req, res) => {
  const { room_id } = req.params;
  res.json(chatService.getMessagesForRoom(room_id));
});

app.post("/api/messages/send", authUser, (req: any, res) => {
  const { roomId, content } = req.body;
  if (!roomId || !content) {
    return res.status(400).json({ error: "Sala e conteúdo da mensagem são obrigatórios." });
  }

  try {
    // Verificar flood
    moderationService.checkFloodLimit(req.user.id, req.user.username);

    const message = chatService.addMessage(roomId, req.user.id, content);
    
    // Broadcast via WS Pub/Sub
    redisService.publish("chat_messages", message);
    
    res.json(message);
  } catch (error: any) {
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError && parsedError.type === "warning") {
        return res.status(400).json(parsedError);
      }
    } catch (e) {
      // Not a JSON error, proceed with normal text error
    }
    res.status(400).json({ error: error.message });
  }
});
// Administração e Moderação
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "A senha de credencial é obrigatória." });
  }

  const authData = adminService.authenticateAdmin(username || "", password);
  if (!authData) {
    return res.status(401).json({ error: "Credenciais incorretas!" });
  }

  const token = jwt.sign(
    { userId: username || "painel_admin", role: authData.role },
    jwtSecret,
    { expiresIn: "1d" }
  );

  res.cookie("admin_token", token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
  res.json({ token, role: authData.role, username: username || authData.username });
});

// --- Gerenciamento Dinâmico de Staff (Exclusivo de Owner) ---
app.get("/api/admin/staff", authOwner, (req, res) => {
  try {
    res.json(db.getAdminUsers());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/staff/create", authOwner, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Todos os campos (login, senha, cargo) são obrigatórios." });
  }
  if (role !== "admin" && role !== "moderator") {
    return res.status(400).json({ error: "Cargo inválido. Escolha 'admin' ou 'moderator'." });
  }

  try {
    const existing = db.getAdminUser(username);
    if (existing) {
      return res.status(400).json({ error: "Este login já está sendo utilizado por outro colaborador." });
    }
    const staff = db.addAdminUser(username, password, role);
    res.json({ success: true, username: staff.username, role: staff.role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/staff/delete", authOwner, (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "O nome de usuário é obrigatório." });
  }

  try {
    db.removeAdminUser(username);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/external-links", (req, res) => {
  try {
    res.json(db.getExternalLinks());
  } catch (err: any) {
    console.error("[API ERROR] Falha ao obter links externos:", err.message || err);
    res.status(500).json({ error: err.message || "Erro interno ao obter links externos" });
  }
});

app.post("/api/admin/external-links", authAdmin, (req: any, res) => {
  if (req.admin.role !== "owner" && req.admin.role !== "admin") {
    return res.status(403).json({ error: "Apenas Owner e Admin podem alterar links externos." });
  }
  try {
    const updatedLinks = db.updateExternalLinks(req.body);
    
    // Publish changes via socket so all clients update immediately
    redisService.publish("external_links_updated", updatedLinks);
    
    res.json(updatedLinks);
  } catch (err: any) {
    console.error("[API ERROR] Falha ao atualizar links externos:", err.message || err);
    res.status(500).json({ error: err.message || "Erro interno ao atualizar links externos" });
  }
});

// --- Palavras Proibidas ---
app.get("/api/admin/prohibited-words", authAdmin, (req, res) => {
  res.json(adminService.getProhibitedWords());
});

app.post('/api/admin/prohibited-words', authAdmin, (req, res) => {
  console.log('[ADMIN] Tentativa de adicionar palavra proibida:', req.body);

  try {
    const { word, severity } = req.body;

    if (!word || typeof word !== 'string') {
      console.warn('[ADMIN] Palavra inválida recebida:', word);
      return res.status(400).json({ error: 'Palavra inválida' });
    }

    if (severity !== 'block' && severity !== 'warn') {
      console.warn('[ADMIN] Severidade inválida:', severity);
      return res.status(400).json({ error: 'Severidade inválida' });
    }

    const pw = adminService.addProhibitedWord(word, severity as "block" | "warn");

    console.log('[ADMIN] Palavra adicionada com sucesso:', pw.word);

    res.json({ success: true, word: pw.word });

  } catch (err: any) {
    console.error('[ADMIN ERROR] Falha ao adicionar palavra proibida:', err.message || err);
    res.status(500).json({ error: err.message || 'Erro interno ao adicionar palavra' });
  }
});

app.delete("/api/admin/prohibited-words", authAdmin, (req: any, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: "A palavra é obrigatória." });
  }
  adminService.removeProhibitedWord(word);
  res.json({ success: true });
});

app.get("/api/admin/dashboard", authAdmin, (req, res) => {
  res.json(adminService.getDashboardMetrics());
});

app.get("/api/admin/messages/reported", authAdmin, (req, res) => {
  const { sortBy } = req.query;
  const sort = (sortBy === "likes" || sortBy === "dislikes" ? sortBy : "reports") as "reports" | "likes" | "dislikes";
  res.json(adminService.getReportedMessages(sort));
});

app.post("/api/admin/message/delete", authAdmin, (req: any, res) => {
  const { messageId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: "ID da mensagem é obrigatório." });
  }

  const success = chatService.deleteMessage(messageId);
  if (success) {
    redisService.publish("chat_interactions", { id: messageId, hidden: true });
    
    moderationService.addAuditLog(
      "delete_message",
      req.admin.role.toUpperCase(),
      messageId,
      `Mensagem deletada pelo moderador.`
    );
    res.json({ status: "success", message: "Mensagem ocultada com sucesso." });
  } else {
    res.status(404).json({ error: "Mensagem não encontrada." });
  }
});

app.post("/api/admin/message/ignore-report", authAdmin, (req: any, res) => {
  const { messageId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: "ID da mensagem é obrigatório." });
  }

  try {
    const msg = moderationService.ignoreReport(messageId, req.admin.role.toUpperCase());
    redisService.publish("chat_interactions", { id: messageId, hidden: false, moderation_status: "ignored" });
    res.json({ status: "success", message: "Denúncia ignorada com sucesso." });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post("/api/admin/user/ban", authAdmin, (req: any, res) => {
  const { userId, reason } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "ID do usuário é obrigatório." });
  }

  const targetUser = userService.getUser(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  userService.banUser(userId, reason || "Infração das diretrizes", targetUser.ip_address);
  
  // Propagar banimento
  redisService.publish("user_bans", { userId });

  moderationService.addAuditLog(
    "ban_user",
    req.admin.role.toUpperCase(),
    userId,
    `Usuário ${targetUser.username} (IP: ${targetUser.ip_address}) banido permanentemente.`
  );

  res.json({ status: "success", message: `Usuário ${targetUser.username} banido com sucesso.` });
});

app.post("/api/admin/user/mute", authAdmin, (req: any, res) => {
  const { userId, status } = req.body; // active ou muted
  if (!userId || !status) {
    return res.status(400).json({ error: "Usuário e status são obrigatórios." });
  }

  try {
    const updatedUser = userService.updateUserStatus(userId, status);
    
    // Propagar silenciamento
    redisService.publish("user_mutes", { userId, status });

    moderationService.addAuditLog(
      "mute_user",
      req.admin.role.toUpperCase(),
      userId,
      `Status do usuário alterado para ${status.toUpperCase()}.`
    );

    res.json({ status: "success", user: updatedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/user/unban", authAdmin, (req: any, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "ID do usuário é obrigatório." });
  }

  userService.unbanUser(userId);

  moderationService.addAuditLog(
    "unban_user",
    req.admin.role.toUpperCase(),
    userId,
    `Banimento removido.`
  );

  res.json({ status: "success", message: "Usuário desbanido com sucesso." });
});

app.post("/api/admin/rooms/create", authAdmin, (req: any, res) => {
  try {
    if (req.admin.role !== "owner" && req.admin.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem criar salas." });
    }
    const newRoom = roomService.createRoom(req.body);
    
    moderationService.addAuditLog(
      "update_room",
      req.admin.role.toUpperCase(),
      newRoom.id,
      `Nova sala criada: ${newRoom.name}`
    );
    
    res.json({ status: "success", room: newRoom });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/rooms/delete", authAdmin, (req: any, res) => {
  try {
    if (req.admin.role !== "owner" && req.admin.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem excluir salas." });
    }
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "ID da sala é obrigatório." });
    
    const success = roomService.deleteRoom(roomId);
    
    moderationService.addAuditLog(
      "update_room",
      req.admin.role.toUpperCase(),
      roomId,
      `Sala excluída permanentemente.`
    );
    
    res.json({ status: "success", success });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/rooms/update", authAdmin, (req: any, res) => {
  const { roomId, name, status, visibility, password, max_users, pinnedMessage, ctaLink, ctaText } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: "ID da sala é obrigatório." });
  }

  try {
    const updatedRoom = roomService.updateRoomConfig(roomId, { 
      name, status, visibility, password, max_users,
      pinnedMessage, ctaLink, ctaText 
    });
    
    // Sincronizar via Redis Pub/Sub
    redisService.publish("room_config_updates", updatedRoom);

    moderationService.addAuditLog(
      "update_room",
      req.admin.role.toUpperCase(),
      roomId,
      `Configuração da sala ${updatedRoom.name} atualizada.`
    );

    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Quick Actions para o Admin Panel (Novos Endpoints)
app.post("/api/admin/rooms/rename", authAdmin, (req: any, res) => {
  const { roomId, newName } = req.body;
  if (!roomId || !newName) return res.status(400).json({ error: "ID e novo nome obrigatórios." });
  try {
    const updatedRoom = roomService.updateRoomName(roomId, newName);
    redisService.publish("room_config_updates", updatedRoom);
    moderationService.addAuditLog("update_room", req.admin.role.toUpperCase(), roomId, `Nome alterado para ${newName}`);
    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post("/api/admin/rooms/toggle-visibility", authAdmin, (req: any, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "ID da sala é obrigatório." });
  try {
    const updatedRoom = roomService.toggleVisibility(roomId);
    redisService.publish("room_config_updates", updatedRoom);
    moderationService.addAuditLog("update_room", req.admin.role.toUpperCase(), roomId, `Visibilidade alterada para ${updatedRoom.visibility}.`);
    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post("/api/admin/rooms/set-password", authAdmin, (req: any, res) => {
  const { roomId, password } = req.body;
  if (!roomId || !password) return res.status(400).json({ error: "ID e senha são obrigatórios." });
  try {
    const updatedRoom = roomService.setPassword(roomId, password);
    redisService.publish("room_config_updates", updatedRoom);
    moderationService.addAuditLog("update_room", req.admin.role.toUpperCase(), roomId, `Senha definida.`);
    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post("/api/admin/rooms/remove-password", authAdmin, (req: any, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "ID da sala é obrigatório." });
  try {
    const updatedRoom = roomService.removePassword(roomId);
    redisService.publish("room_config_updates", updatedRoom);
    moderationService.addAuditLog("update_room", req.admin.role.toUpperCase(), roomId, `Senha removida.`);
    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post("/api/admin/rooms/toggle-mute", authAdmin, (req: any, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "ID da sala é obrigatório." });
  try {
    const updatedRoom = roomService.toggleReadOnly(roomId);
    redisService.publish("room_config_updates", updatedRoom);
    moderationService.addAuditLog("update_room", req.admin.role.toUpperCase(), roomId, `Modo leitura alterado.`);
    res.json({ status: "success", room: updatedRoom });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get("/api/admin/rooms/share-link", authAdmin, (req: any, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: "ID da sala é obrigatório." });
  const room = roomService.getRoom(roomId as string);
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });
  res.json({ link: `/chat?room=${encodeURIComponent(room.name)}` });
});

app.get("/api/admin/users", authAdmin, (req, res) => {
  res.json(userService.listUsers());
});

app.get("/api/admin/bans", authAdmin, (req, res) => {
  res.json(db.getBansList());
});

app.get("/api/admin/room-access/:roomId", authAdmin, (req, res) => {
  const { roomId } = req.params;
  if (!roomId) {
    return res.status(400).json({ error: "ID da sala é obrigatório." });
  }
  try {
    const stats = metricsService.getStats(roomId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/top-rooms-today", authAdmin, (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const stats = metricsService.getTopRoomsToday(limit);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Logs de Auditoria (REST)
app.get("/api/admin/logs", authAdmin, (req, res) => {
  res.json(moderationService.getAuditLogs());
});

// Ações exclusivas do Dono (Promover/Rebaixar Moderadores)
app.post("/api/admin/user/promote", authOwner, (req: any, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "ID do usuário é obrigatório." });
  }

  try {
    const user = adminService.promoteToModerator(userId, req.admin.role.toUpperCase());
    res.json({ status: "success", message: `Usuário ${user.username} promovido a Moderador.`, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/admin/user/demote", authOwner, (req: any, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "ID do usuário é obrigatório." });
  }

  try {
    const user = adminService.demoteToUser(userId, req.admin.role.toUpperCase());
    res.json({ status: "success", message: `Moderador ${user.username} rebaixado a usuário comum.`, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 📊 TRACKING & CONVERSIONS
// ==========================================

app.post("/api/track-click", (req, res) => {
  const { userId, roomId, triggerType, sessionId } = req.body;
  if (!userId || !roomId || !triggerType) {
    return res.status(400).json({ error: "Parâmetros obrigatórios ausentes." });
  }

  // Fire-and-forget, sem bloquear
  setTimeout(() => {
    try {
      db.addClickEvent({
        id: `click_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        userId,
        roomId,
        triggerType,
        timestamp: Date.now(),
        sessionId: sessionId || `session_${Math.random().toString(36).substr(2,9)}`
      });
    } catch(e) {
      console.error("Error tracking click:", e);
    }
  }, 0);

  res.status(200).json({ status: "tracked" });
});

app.get("/api/admin/metrics/conversions", authAdmin, async (req, res) => {
  try {
    const events = db.getClickEvents?.() || [];
    
    const today = new Date().toISOString().slice(0, 10);
    
    const todayEvents = events.filter(e => {
      if (!e?.timestamp) return false;
      return new Date(e.timestamp).toISOString().slice(0, 10) === today;
    });
    
    const total = todayEvents.length;
    
    const byTrigger: Record<string, number> = {};
    const byRoom: Record<string, number> = {};
    
    for (const e of todayEvents) {
      if (!e || !e.triggerType || !e.roomId) continue;
    
      byTrigger[e.triggerType] = (byTrigger[e.triggerType] || 0) + 1;
      byRoom[e.roomId] = (byRoom[e.roomId] || 0) + 1;
    }
    
    console.log("Eventos encontrados:", events.length);
    
    return res.json({
      total,
      byTrigger,
      byRoom
    });
    
  } catch (err) {
    console.error("Erro em /metrics/conversions:", err);
    
    return res.status(200).json({
      total: 0,
      byTrigger: {},
      byRoom: {}
    });
  }
});

// ==========================================
// 🔌 REAL-TIME MESSAGING & WEBSOCKET SETUP
// ==========================================
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 30000,
  pingInterval: 15000
});

// Registrar handlers WebSockets modulares
setupSocketHandlers(io);

// ==========================================
// 🛠️ FRONTEND SERVING (Vite Integration)
// ==========================================
async function startServer() {
  await db.init();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor EGE Chat Rooms rodando com sucesso em http://0.0.0.0:${PORT}`);
  });
}

startServer();
