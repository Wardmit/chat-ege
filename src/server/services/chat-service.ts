import { db } from "../db";
import { Message } from "../../types.ts";
import { moderationService } from "./moderation-service";
import { userService } from "./user-service";

export class ChatService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupJob();
  }

  private userLastMessages = new Map<string, {text: string, time: number}[]>();

  public getMessagesForRoom(roomId: string): Message[] {
    return db.getMessagesForRoom(roomId);
  }

  public getMessage(messageId: string): Message | undefined {
    return db.getMessage(messageId);
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\u200B/g, "") // remove invisible unicode chars
      .replace(/(.)\1{2,}/g, "$1$1"); // max 2 repeating chars
  }

  public addMessage(roomId: string, userId: string, content: string, replyToMessageId?: string): Message {
    // Sanitização simples contra XSS no backend
    const sanitizedContent = this.sanitizeXSS(content);

    // Anti-Spam Hardening
    const normalizedText = sanitizedContent
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");

    const now = Date.now();
    const history = this.userLastMessages.get(userId) || [];
    
    // Cleanup old messages (> 10s)
    const recentHistory = history.filter(h => now - h.time < 10000);

    // Check if same content was sent
    const isRepeated = recentHistory.some(h => h.text === normalizedText && normalizedText.length > 0);
    if (isRepeated) {
      throw new Error("Envio bloqueado: mensagem repetida detectada.");
    }

    recentHistory.push({ text: normalizedText, time: now });
    this.userLastMessages.set(userId, recentHistory);

    // Validate against prohibited words
    let validationText = this.normalizeText(sanitizedContent);

    const prohibitedWords = db.getProhibitedWords();
    let warnFlag = false;
    let warningPayload: any = null;

    for (const pw of prohibitedWords) {
      // Escape all regex characters
      const escapedWord = pw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Smart contextual regex: (^|\s|\W)word(\s|\W|$)
      const regex = new RegExp(`(^|\\s|\\W)${escapedWord}(\\s|\\W|$)`, 'i');

      if (regex.test(validationText)) {
        if (pw.severity === "block") {
          const user = userService.getUser(userId);
          const warnResult = moderationService.onWarn(userId, user ? user.username : "Desconhecido");
          
          if (warnResult && warnResult.type === "warning") {
            warningPayload = warnResult;
          } else {
            throw new Error("Evite palavras ofensivas ou será banido.");
          }
        } else if (pw.severity === "warn") {
          warnFlag = true;
        }
      }
    }

    if (warningPayload) {
      // Throw an error with a custom JSON structure so frontend can catch it and display a Toast
      throw new Error(JSON.stringify(warningPayload));
    }

    // Parse formatRanges and strip asterisks
    let formattedText = sanitizedContent;
    let formatRanges: { start: number; end: number; type: "bold" }[] = [];

    try {
      let match;
      const regex = /\*(.*?)\*/g;
      let offset = 0;

      while ((match = regex.exec(sanitizedContent)) !== null) {
        const matchedText = match[1];
        const fullMatch = match[0];
        
        const start = match.index - offset;
        const end = start + matchedText.length;
        
        if (matchedText.length > 0) {
          formatRanges.push({ start, end, type: "bold" });
        }
        
        offset += (fullMatch.length - matchedText.length);
      }

      formattedText = sanitizedContent.replace(/\*(.*?)\*/g, "$1");
      
      // Sort ranges and remove overlaps
      if (formatRanges.length > 0) {
        formatRanges.sort((a, b) => a.start - b.start);
        const resolvedRanges = [];
        let current = formatRanges[0];
        
        for (let i = 1; i < formatRanges.length; i++) {
          const next = formatRanges[i];
          if (next.start < current.end) {
            current.end = Math.max(current.end, next.end);
          } else {
            resolvedRanges.push(current);
            current = next;
          }
        }
        resolvedRanges.push(current);
        formatRanges = resolvedRanges;
      }
    } catch (e) {
      // Fallback to plain text on error
      formattedText = sanitizedContent;
      formatRanges = [];
    }

    // Extract and classify up to 2 valid URLs based on formatted text
    const links = this.extractAndClassifyLinks(formattedText);

    // Reply Logic
    let replyToObj;
    if (replyToMessageId) {
      // Find original message
      const originalMessage = db.getMessage(replyToMessageId);
      
      if (originalMessage) {
        replyToObj = {
          messageId: originalMessage.id,
          text: originalMessage.content,
          username: originalMessage.username
        };
      } else {
        replyToObj = {
          messageId: null,
          text: "Mensagem não disponível",
          username: "Sistema"
        };
      }
    }

    const message = db.addMessage(roomId, userId, sanitizedContent, links.length > 0 ? links : undefined, formattedText, formatRanges, replyToObj);
    if (warnFlag) {
      message.moderation_status = "pending";
      db.save();
    }
    
    return message;
  }

  private extractAndClassifyLinks(text: string): { url: string; type: "image" | "pdf" | "video" | "cloud" | "generic" }[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex) || [];
    
    const results: { url: string; type: "image" | "pdf" | "video" | "cloud" | "generic" }[] = [];
    
    for (const match of matches) {
      if (results.length >= 2) break;
      
      try {
        const urlObj = new URL(match);
        const urlStr = urlObj.toString();
        const hostname = urlObj.hostname.toLowerCase();
        const pathname = urlObj.pathname.toLowerCase();
        
        // Whitelist domains for previews
        const isWhitelisted = [
          "drive.google.com",
          "dropbox.com",
          "onedrive.live.com",
          "youtube.com",
          "youtu.be"
        ].includes(hostname) || hostname.endsWith(".youtube.com");

        let type: "image" | "pdf" | "video" | "cloud" | "generic" = "generic";

        if (isWhitelisted) {
          if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
            type = "video";
          } else if (
            hostname.includes("drive.google.com") || 
            hostname.includes("dropbox.com") || 
            hostname.includes("onedrive.live.com")
          ) {
            type = "cloud";
          }
        }
        
        // Some users might share whitelisted links ending in specific extensions.
        // We only allow previews for whitelisted domains as per strict rules.
        // If the user meant that images/pdfs are allowed ANYWHERE, they didn't clarify,
        // but the rule says "Allow previews ONLY for: [whitelist]". 
        // Thus, we classify non-whitelisted as "generic".
        // If it IS whitelisted but ends with .pdf/.jpg, we could classify as pdf/image.
        if (isWhitelisted) {
           if (pathname.endsWith(".pdf")) type = "pdf";
           else if (pathname.endsWith(".jpg") || pathname.endsWith(".png") || pathname.endsWith(".gif") || pathname.endsWith(".webp")) type = "image";
        }

        results.push({ url: urlStr, type });
      } catch (e) {
        // Ignorar URLs malformadas
      }
    }
    
    return results;
  }

  public deleteMessage(messageId: string): boolean {
    return db.deleteMessage(messageId);
  }

  public addInteraction(
    messageId: string,
    userId: string,
    ipAddress: string,
    type: "like" | "dislike" | "report"
  ): Message {
    return db.addInteraction(messageId, userId, ipAddress, type);
  }

  /**
   * Iniciar o Job de limpeza periódica (a cada 5 minutos)
   */
  public startCleanupJob() {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      console.log("🧹 Executando job de limpeza em segundo plano: purgando mensagens excedentes por sala...");
      try {
        db.runPeriodicCleanup();
      } catch (err) {
        console.error("Erro ao rodar job de limpeza de mensagens:", err);
      }
    }, 5 * 60 * 1000); // 5 minutos
  }

  /**
   * Encerrar o Job
   */
  public stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Sanitização XSS para remover tags HTML/Javascript maliciosas
   */
  public sanitizeXSS(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }
}

export const chatService = new ChatService();
