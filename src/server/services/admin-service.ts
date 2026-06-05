import { db } from "../db";
import { userService } from "./user-service";
import { moderationService } from "./moderation-service";
import bcrypt from "bcryptjs";

export class AdminService {
  
  /**
   * Autenticar credenciais administrativas de acordo com o login e a senha informados
   */
  public authenticateAdmin(username: string, password: string): { role: "owner" | "admin" | "moderator"; username: string } | null {
    // 1. Verificar Owner (Dono/Proprietário - Maior privilégio)
    if (password === "dono123" || db.testOwnerLogin(password)) {
      return { role: "owner", username: "EGE Dono (Owner)" };
    }

    // 2. Verificar contas dinâmicas cadastradas de staff
    const cleanName = username.trim().toLowerCase();
    const staff = db.getAdminUser(cleanName);
    if (staff && bcrypt.compareSync(password, staff.hash)) {
      return { role: staff.role, username: staff.username };
    }

    return null;
  }

  public getDashboardMetrics() {
    return db.getDashboardMetrics();
  }

  public getReportedMessages(sortBy: "reports" | "likes" | "dislikes" = "reports") {
    return db.getReportedMessages(sortBy);
  }

  /**
   * Promover usuário para moderador (Ação exclusiva de Owner)
   */
  public promoteToModerator(userId: string, operator: string): any {
    const user = userService.getUser(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    if (user.role === "owner" || user.role === "admin") {
      throw new Error("Não é possível alterar o cargo de outros administradores ou donos.");
    }

    userService.updateUserRole(userId, "moderator");
    
    moderationService.addAuditLog(
      "promote_moderator",
      operator,
      userId,
      `Usuário ${user.username} promovido permanentemente para Moderador.`
    );

    // Notificar socket ativo da mudança imediata
    const socket = userService.getActiveSocket(userId);
    if (socket) {
      socket.emit("user_role_updated", { userId, role: "moderator" });
    }

    return user;
  }

  /**
   * Rebaixar moderador para usuário comum (Ação exclusiva de Owner)
   */
  public demoteToUser(userId: string, operator: string): any {
    const user = userService.getUser(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    if (user.role === "owner" || user.role === "admin") {
      throw new Error("Não é possível alterar o cargo de outros administradores ou donos.");
    }

    userService.updateUserRole(userId, "user");

    moderationService.addAuditLog(
      "demote_moderator",
      operator,
      userId,
      `Usuário ${user.username} rebaixado para Usuário comum.`
    );

    // Notificar socket ativo da mudança imediata
    const socket = userService.getActiveSocket(userId);
    if (socket) {
      socket.emit("user_role_updated", { userId, role: "user" });
    }

    return user;
  }

  // --- PALAVRAS PROIBIDAS ---

  public getProhibitedWords() {
    return db.getProhibitedWords();
  }

  public addProhibitedWord(word: string, severity: "block" | "warn") {
    if (!word || typeof word !== "string" || word.trim() === "") {
      throw new Error("Palavra inválida. O campo não pode estar vazio.");
    }

    // Remover tags de script e caracteres perigosos
    const cleanHtml = word.replace(/<[^>]*>?/gm, '');
    
    // Normalização completa: minúsculo e remoção de acentos
    const normalizedWord = cleanHtml
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (normalizedWord.length < 2) {
      throw new Error("A palavra deve ter no mínimo 2 caracteres.");
    }
    if (normalizedWord.length > 30) {
      throw new Error("A palavra excede o limite máximo de 30 caracteres.");
    }

    // Rejeitar palavras formadas apenas por símbolos (após normalização/remoção)
    const justSymbols = /^[^a-z0-9]+$/i;
    if (justSymbols.test(normalizedWord)) {
      throw new Error("A palavra não pode conter apenas símbolos.");
    }

    const existingWords = db.getProhibitedWords();
    if (existingWords.some(pw => pw.word === normalizedWord)) {
      throw new Error("Esta palavra já está registrada no filtro.");
    }
    
    return db.addProhibitedWord(normalizedWord, severity);
  }

  public removeProhibitedWord(word: string) {
    db.removeProhibitedWord(word);
  }
}

export const adminService = new AdminService();
