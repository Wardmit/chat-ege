import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { User, Room, Message, AuditLog, ProhibitedWord, Ban, Interaction, AdminUser } from "../types.ts";
import { firestoreService } from "./services/firestore-service.ts";

interface DatabaseSchema {
  users: Record<string, User>;
  rooms: Record<string, Room>;
  messages: Message[];
  interactions: Interaction[];
  bans: Ban[];
  auditLogs: AuditLog[];
  adminConfig: {
    hash: string;
    modHash: string;
    ownerHash: string;
  };
  externalLinks: {
    egeGames: string;
    escolaEGE: string;
    salaProfessores: string;
    diretrizesComunidade?: string;
    privacidade?: string;
    manualModeracao?: string;
  };
  prohibitedWords: ProhibitedWord[];
  adminUsers?: Record<string, AdminUser>;
  roomAccessStats?: Record<string, Record<string, string[]>>;
}

const DATA_FILE = path.join(process.cwd(), "ege-chat-data.json");

const CATEGORIES = [
  { name: "Educação Infantil", icon: "school", desc: "Discussões sobre metodologias." },
  { name: "Ciências Exatas", icon: "science", desc: "Física, Química e Matemática." },
  { name: "Educação Física", icon: "sports_basketball", desc: "Planejamento de atividades." },
  { name: "Literatura Brasileira", icon: "menu_book", desc: "Clube de leitura e debates." },
  { name: "História Geral", icon: "history_edu", desc: "Debates históricos." },
  { name: "Geografia", icon: "public", desc: "Geopolítica e relevo." },
  { name: "Artes", icon: "palette", desc: "História da arte e prática." },
  { name: "Inglês", icon: "language", desc: "Conversação e gramática." },
  { name: "Biologia", icon: "biotech", desc: "Genética e ecologia." },
  { name: "Sociologia", icon: "groups", desc: "Estudos sociais contemporâneos." },
  { name: "Filosofia", icon: "psychology", desc: "Pensamento crítico." },
  { name: "Redação", icon: "edit_document", desc: "Treino para o ENEM." }
];

const COLORS = [
  "Azul", "Vermelho", "Verde", "Amarelo", "Roxo", "Laranja", "Ciano", "Dourado", "Esmeralda",
  "Violeta", "Rosa", "Ambar", "Cobalto", "Rubi", "Prata", "Turquesa", "Grafite", "Celeste"
];

const ANIMALS = [
  "Tigre", "Leao", "Aguia", "Urso", "Lobo", "Raposa", "Cervo", "Falcao", "Coruja", "Pantera",
  "Tubarao", "Golfinho", "Coala", "Panda", "Leopardo", "Gato", "Fenix", "Dragao", "Cobra"
];

class Database {
  private data: DatabaseSchema;
  public roomAccessStats: Record<string, Record<string, string[]>> = {};
  public clickEvents: ClickEvent[] = [];
  private recentClicksMap: Map<string, number> = new Map();
  
  // Estruturas de índice em memória para alta performance (Acesso O(1))
  private usersMap: Map<string, User> = new Map();
  private roomsMap: Map<string, Room> = new Map();
  private messagesMap: Map<string, Message> = new Map();

  constructor() {
    this.data = {
      users: {},
      rooms: {},
      messages: [],
      interactions: [],
      bans: [],
      auditLogs: [],
      adminConfig: {
        hash: bcrypt.hashSync("admin123", 10),
        modHash: bcrypt.hashSync("mod123", 10),
        ownerHash: bcrypt.hashSync("EgeDono123!", 10)
      },
      externalLinks: {
        egeGames: "",
        escolaEGE: "",
        salaProfessores: "",
        diretrizesComunidade: "",
        privacidade: "",
        manualModeracao: ""
      },
      prohibitedWords: [],
      adminUsers: {}
    };
  }

  public async init() {
    console.log("⏳ Sincronizando com banco de dados na nuvem...");
    const firestoreData = await firestoreService.getInitialData();
    if (firestoreData) {
      this.data.users = firestoreData.users;
      this.data.rooms = firestoreData.rooms;
      this.data.bans = firestoreData.bans;
      
      if (firestoreData.config.auditLogs) this.data.auditLogs = firestoreData.config.auditLogs.logs;
      if (firestoreData.config.externalLinks) this.data.externalLinks = firestoreData.config.externalLinks;
      if (firestoreData.config.prohibitedWords) this.data.prohibitedWords = firestoreData.config.prohibitedWords.words;
      if (firestoreData.config.adminUsers) this.data.adminUsers = firestoreData.config.adminUsers.users || {};
      else this.data.adminUsers = this.data.adminUsers || {};
      if (firestoreData.config.roomAccessStats) this.roomAccessStats = firestoreData.config.roomAccessStats.stats || {};
    } else {
      this.loadLocalFallback();
    }
    
    this.rebuildIndexes();
    this.initializeRoomsAndAdmins();
    
    // Zera o current_users de todas as salas na inicialização para corrigir o contador
    this.roomsMap.forEach((room) => {
      room.current_users = 0;
    });
    this.save();
    
    console.log("✅ Banco de dados sincronizado e pronto.");
  }

  private loadLocalFallback() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const fileContent = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);
        this.data = { ...this.data, ...parsed };
      }
      
      if (!this.data.prohibitedWords) {
        this.data.prohibitedWords = [];
      }
      if (!this.data.adminUsers) {
        this.data.adminUsers = {};
      }
    } catch (e) {
      console.error("Falha ao carregar o banco de dados local:", e);
    }
  }

  private rebuildIndexes() {
    this.usersMap.clear();
    this.roomsMap.clear();
    this.messagesMap.clear();

    // Indexar Usuários
    if (this.data.users) {
      Object.keys(this.data.users).forEach((id) => {
        this.usersMap.set(id, this.data.users[id]);
      });
    }

    // Indexar Salas
    if (this.data.rooms) {
      Object.keys(this.data.rooms).forEach((id) => {
        this.roomsMap.set(id, this.data.rooms[id]);
      });
    }

    // Indexar Mensagens
    if (this.data.messages) {
      this.data.messages.forEach((msg) => {
        this.messagesMap.set(msg.id, msg);
      });
    }
  }

  public save() {
    try {
      this.data.users = {};
      this.usersMap.forEach((user, id) => {
        this.data.users[id] = user;
      });

      this.data.rooms = {};
      this.roomsMap.forEach((room, id) => {
        this.data.rooms[id] = room;
      });

      // No Cloud Run, não salvamos em arquivo local para evitar perda de dados.
      // O Firestore cuidará da persistência.
    } catch (e) {
      console.error("Falha ao sincronizar cache interno:", e);
    }
  }

  private initializeRoomsAndAdmins() {
    // Gerar salas predefinidas se elas não existirem
    const roomKeys = Array.from(this.roomsMap.keys()).filter(k => !this.roomsMap.get(k)?.parent_id);
    if (roomKeys.length === 0) {
      for (let i = 0; i < 50; i++) {
        const category = CATEGORIES[i % CATEGORIES.length];
        const id = `room_${i + 1}`;
        let status: "open" | "locked" | "read-only" = "open";
        if (i % 7 === 1) {
          status = "locked";
        } else if (i % 11 === 3) {
          status = "read-only";
        }

        const room: Room = {
          id,
          name: `${category.name} ${i + 1}`,
          category: category.name,
          status,
          visibility: "public",
          password: status === "locked" ? "123456" : undefined,
          max_users: 300,
          current_users: 0
        };
        this.roomsMap.set(id, room);
      }
      this.save();
    }
  }

  // --- OPERAÇÕES DE USUÁRIOS ---

  public getOrCreateUser(userId: string, ipAddress: string): User {
    let user = this.usersMap.get(userId);
    if (user) {
      if (user.status === "banned") {
        return user;
      }
      user.ip_address = ipAddress;
      
      // Cooldown de advertências
      if (user.warnCount && user.lastWarnAt) {
        const hoursPassed = (Date.now() - user.lastWarnAt) / (1000 * 60 * 60);
        if (hoursPassed >= 24) {
          // Diminuir gradualmente: a cada 24h sem infração, remove 2 pontos.
          const decrement = Math.floor(hoursPassed / 24) * 2;
          user.warnCount = Math.max(0, user.warnCount - decrement);
          // Reinicia o tempo para o contador atual
          user.lastWarnAt = Date.now();
        }
      }
      
      this.save();
      firestoreService.saveUser(user);
      return user;
    }

    // Verificar se o IP está banido
    if (this.isIpBanned(ipAddress)) {
      user = {
        id: userId,
        username: this.generateRandomUsername(),
        role: "user",
        status: "banned",
        ip_address: ipAddress
      };
      this.usersMap.set(userId, user);
      this.save();
      firestoreService.saveUser(user);
      return user;
    }

    // Criar novo usuário anônimo
    user = {
      id: userId,
      username: this.generateRandomUsername(),
      role: "user",
      status: "active",
      ip_address: ipAddress
    };
    this.usersMap.set(userId, user);
    this.save();
    firestoreService.saveUser(user);
    return user;
  }

  public generateRandomUsername(): string {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${color}${animal}_${num}`;
  }

  public updateUsername(userId: string, newName: string): User {
    const user = this.usersMap.get(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    if (user.status === "banned") throw new Error("Usuário está banido.");
    
    const name = newName.trim().replace(/\s+/g, "_");
    if (name.length < 3 || name.length > 25) {
      throw new Error("O nome de usuário deve conter de 3 a 25 caracteres.");
    }

    user.username = name;
    this.save();
    firestoreService.saveUser(user);
    return user;
  }

  public updateUserRole(userId: string, role: "user" | "moderator" | "admin" | "owner"): User {
    const user = this.usersMap.get(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    user.role = role;
    this.save();
    firestoreService.saveUser(user);
    return user;
  }

  public updateUserStatus(userId: string, status: "active" | "muted" | "banned"): User {
    const user = this.usersMap.get(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    user.status = status;

    if (status === "banned") {
      this.banUser(userId, user.ip_address, "Banido por decisão administrativa.");
    } else {
      // Remover dos banimentos se for restaurado para ativo
      this.data.bans = this.data.bans.filter(b => b.uuid !== userId && b.ip !== user.ip_address);
    }

    this.save();
    firestoreService.saveUser(user);
    return user;
  }

  public getUser(userId: string): User | undefined {
    return this.usersMap.get(userId);
  }

  public listUsers(): User[] {
    return Array.from(this.usersMap.values());
  }

  // --- SISTEMA DE TRACKING E CONVERSÃO ---

  public getClickEvents(): ClickEvent[] {
    return this.clickEvents || [];
  }

  public addClickEvent(event: ClickEvent): boolean {
    if (!event) return false;

    if (!this.clickEvents) {
      this.clickEvents = [];
    }

    const key = `${event.userId}_${event.roomId}_${event.triggerType}`;
    const now = Date.now();
    const lastClick = this.recentClicksMap.get(key);

    // Deduplicação: ignorar cliques no mesmo CTA num intervalo de 10 segundos
    if (lastClick && now - lastClick < 10000) {
      return false; // Ignorado por deduplicação
    }

    this.recentClicksMap.set(key, now);
    this.clickEvents.push(event);

    // Limite FIFO 5000 eventos
    if (this.clickEvents.length > 5000) {
      this.clickEvents.shift();
    }

    return true;
  }

  // --- MÉTODOS DE BANIMENTO E LISTAGENS ---

  public banUser(userId: string, ip: string, reason: string) {
    const exists = this.data.bans.some(b => b.uuid === userId || b.ip === ip);
    if (!exists) {
      this.data.bans.push({
        id: uuidv4(),
        uuid: userId,
        ip,
        reason,
        timestamp: new Date().toISOString()
      });
    }

    // Atualizar o status do usuário banido no mapa
    const user = this.usersMap.get(userId);
    if (user) {
      user.status = "banned";
    }

    // Banir todos os cadastros associados ao mesmo IP ou UUID
    this.usersMap.forEach((u) => {
      if (u.id === userId || u.ip_address === ip) {
        u.status = "banned";
      }
    });

    this.save();
    const newBan = this.data.bans[this.data.bans.length - 1];
    if (newBan) firestoreService.saveBan(newBan);
    firestoreService.saveUser(this.usersMap.get(userId)!);
  }

  public unbanUser(userId: string) {
    const user = this.usersMap.get(userId);
    const ip = user?.ip_address;
    
    this.data.bans = this.data.bans.filter(b => b.uuid !== userId && (ip ? b.ip !== ip : true));
    
    if (user) user.status = "active";
    this.usersMap.forEach((u) => {
      if (u.id === userId || (ip && u.ip_address === ip)) {
        u.status = "active";
      }
    });

    this.save();
    firestoreService.deleteBan(userId, ip);
    const u = this.usersMap.get(userId);
    if(u) firestoreService.saveUser(u);
  }

  public isIpBanned(ip: string): boolean {
    return this.data.bans.some(b => b.ip === ip);
  }

  public getBansList(): Ban[] {
    return this.data.bans;
  }

  // --- OPERAÇÕES DE SALAS ---

  public getRooms(): Room[] {
    return Array.from(this.roomsMap.values());
  }

  public getRoom(roomId: string): Room | undefined {
    return this.roomsMap.get(roomId);
  }

  public getRoomByName(name: string): Room | undefined {
    const cleanName = name.toLowerCase().trim();
    return Array.from(this.roomsMap.values()).find(
      r => r.name.toLowerCase().trim() === cleanName || r.id === name
    );
  }

  public getOrCreateRoomWithScaling(primaryRoomId: string): Room {
    const primaryRoom = this.roomsMap.get(primaryRoomId);
    if (!primaryRoom) throw new Error("A sala informada não existe.");

    const baseRoomId = primaryRoom.parent_id || primaryRoom.id;
    const baseRoom = this.roomsMap.get(baseRoomId)!;

    // Coletar grupo de overflow da sala
    const roomGroup = Array.from(this.roomsMap.values()).filter(
      r => r.id === baseRoomId || r.parent_id === baseRoomId
    );

    // Buscar a primeira instância com capacidade abaixo do limite
    let availableRoom = roomGroup.find(r => r.current_users < r.max_users);

    if (!availableRoom) {
      // Escalonar horizontalmente gerando uma nova sub-sala de overflow
      const count = roomGroup.length;
      const nextId = `${baseRoomId}-${count + 1}`;
      
      availableRoom = {
        id: nextId,
        name: `${baseRoom.name.replace(/ \d+$/, "")} ${baseRoom.name.match(/\d+$/)?.[0] || ""}-${count + 1}`.trim(),
        category: baseRoom.category,
        status: baseRoom.status,
        visibility: baseRoom.visibility,
        password: baseRoom.password,
        max_users: baseRoom.max_users,
        current_users: 0,
        parent_id: baseRoomId
      };

      this.roomsMap.set(nextId, availableRoom);
      this.save();
      firestoreService.saveRoom(availableRoom);
    }

    return availableRoom;
  }

  public incrementRoomUsers(roomId: string): Room {
    const room = this.roomsMap.get(roomId);
    if (!room) throw new Error("A sala informada não existe.");
    room.current_users += 1;
    this.save();
    firestoreService.saveRoom(room);
    return room;
  }

  public joinRoomWithScaling(primaryRoomId: string, userId: string): Room {
    const primaryRoom = this.roomsMap.get(primaryRoomId);
    if (!primaryRoom) throw new Error("A sala informada não existe.");

    const baseRoomId = primaryRoom.parent_id || primaryRoom.id;
    const baseRoom = this.roomsMap.get(baseRoomId)!;

    // Coletar grupo de overflow da sala
    const roomGroup = Array.from(this.roomsMap.values()).filter(
      r => r.id === baseRoomId || r.parent_id === baseRoomId
    );

    // Buscar a primeira instância com capacidade abaixo do limite
    let availableRoom = roomGroup.find(r => r.current_users < r.max_users);

    if (!availableRoom) {
      // Escalonar horizontalmente gerando uma nova sub-sala de overflow
      const count = roomGroup.length;
      const nextId = `${baseRoomId}-${count + 1}`;
      
      availableRoom = {
        id: nextId,
        name: `${baseRoom.name.replace(/ \d+$/, "")} ${baseRoom.name.match(/\d+$/)?.[0] || ""}-${count + 1}`.trim(),
        category: baseRoom.category,
        status: baseRoom.status,
        visibility: baseRoom.visibility,
        password: baseRoom.password,
        max_users: baseRoom.max_users,
        current_users: 0,
        parent_id: baseRoomId
      };

      this.roomsMap.set(nextId, availableRoom);
    }

    availableRoom.current_users += 1;
    this.save();
    firestoreService.saveRoom(availableRoom);
    return availableRoom;
  }

  public leaveRoom(roomId: string) {
    const room = this.roomsMap.get(roomId);
    if (room) {
      room.current_users = Math.max(0, room.current_users - 1);
      
      // Excluir salas de overflow que ficarem vazias para limpar os recursos
      if (room.parent_id && room.current_users === 0) {
        this.roomsMap.delete(roomId);
        this.data.messages = this.data.messages.filter(m => m.room_id !== roomId);
        this.rebuildIndexes();
        firestoreService.deleteRoom(roomId);
      } else {
        firestoreService.saveRoom(room);
      }
      this.save();
    }
  }

  public updateRoomConfig(
    roomId: string,
    updates: { name?: string; status?: "open" | "locked" | "read-only"; visibility?: "public" | "hidden"; password?: string; max_users?: number; pinnedMessage?: string; ctaLink?: string; ctaText?: string; }
  ): Room {
    const room = this.roomsMap.get(roomId);
    if (!room) throw new Error("Sala não encontrada.");

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (trimmed.length < 3 || trimmed.length > 50) {
        throw new Error("O nome da sala deve conter entre 3 e 50 caracteres.");
      }
      room.name = trimmed;
    }
    
    if (updates.status !== undefined) room.status = updates.status;
    if (updates.visibility !== undefined) room.visibility = updates.visibility;
    
    if (updates.password !== undefined) {
      room.password = updates.password;
    } else if (updates.status === "open" || updates.status === "read-only") {
      delete room.password;
    }
    
    if (updates.max_users !== undefined) room.max_users = updates.max_users;

    if (updates.pinnedMessage !== undefined) room.pinnedMessage = updates.pinnedMessage;
    if (updates.ctaLink !== undefined) room.ctaLink = updates.ctaLink;
    if (updates.ctaText !== undefined) room.ctaText = updates.ctaText;

    this.save();
    firestoreService.saveRoom(room);
    return room;
  }

  public createRoom(roomData: Partial<Room>): Room {
    const baseRooms = this.getRooms().filter(r => !r.parent_id);
    if (baseRooms.length >= 50) {
      throw new Error("O limite máximo do sistema é de 50 salas principais.");
    }
    
    const roomId = `room_${uuidv4().substring(0,8)}`;
    const newRoom: Room = {
      id: roomId,
      name: roomData.name || `Nova Sala ${baseRooms.length + 1}`,
      category: roomData.category || "Geral",
      status: roomData.status || "open",
      visibility: roomData.visibility || "public",
      password: roomData.password,
      max_users: roomData.max_users || 300,
      current_users: 0,
      pinnedMessage: roomData.pinnedMessage,
      ctaLink: roomData.ctaLink,
      ctaText: roomData.ctaText
    };
    
    this.roomsMap.set(roomId, newRoom);
    this.save();
    firestoreService.saveRoom(newRoom);
    return newRoom;
  }

  public deleteRoom(roomId: string): boolean {
    const room = this.roomsMap.get(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    
    // Deletar também todas as sub-salas (overflow instances) dependentes
    const roomsToDelete = this.getRooms().filter(r => r.id === roomId || r.parent_id === roomId);
    
    for (const r of roomsToDelete) {
      this.roomsMap.delete(r.id);
      firestoreService.deleteRoom(r.id);
      // Apagar mensagens da sala
      this.data.messages = this.data.messages.filter(m => m.room_id !== r.id);
    }
    this.rebuildIndexes();
    this.save();
    return true;
  }

  // --- OPERAÇÕES DE MENSAGENS E LIMITES POR SALA ---

  public getMessagesForRoom(roomId: string): Message[] {
    // Retorna apenas mensagens não ocultadas da sala específica. 
    // Limite rígido de 300 mensagens em memória para visualização instantânea.
    const activeMessages = this.data.messages.filter(m => m.room_id === roomId && !m.hidden);
    return activeMessages.slice(-300);
  }

  public getMessage(messageId: string): Message | undefined {
    return this.messagesMap.get(messageId);
  }

  public addMessage(roomId: string, userId: string, content: string, links?: { url: string; type: "image" | "pdf" | "video" | "cloud" | "generic" }[], formattedText?: string, formatRanges?: {start: number, end: number, type: "bold"}[], replyTo?: Message["replyTo"]): Message {
    const user = this.usersMap.get(userId);
    if (!user) throw new Error("Usuário não registrado.");
    if (user.status === "banned") throw new Error("Usuário banido.");
    if (user.status === "muted") throw new Error("Seu perfil está silenciado. Você não pode postar mensagens.");

    const room = this.roomsMap.get(roomId);
    if (!room) throw new Error("A sala não existe.");
    if (room.status === "read-only") throw new Error("Esta sala está em modo somente leitura.");

    // Controle de inundação (Anti-Spam 2 segundos)
    const now = Date.now();
    if (user.lastMessageTime && now - user.lastMessageTime < 2000) {
      throw new Error("Anti-spam: Aguarde 2 segundos entre o envio de mensagens.");
    }

    if (content.length > 300) {
      throw new Error("Anti-spam: O texto não pode ultrapassar 300 caracteres.");
    }

    user.lastMessageTime = now;

    const message: Message = {
      id: uuidv4(),
      room_id: roomId,
      user_id: userId,
      username: user.username,
      role: user.role,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      likes_count: 0,
      dislikes_count: 0,
      reports_count: 0,
      hidden: false,
      links,
      formattedText,
      formatRanges,
      replyTo
    };

    // Adicionar mensagem à lista persistente
    this.data.messages.push(message);
    this.messagesMap.set(message.id, message);

    // ESTRATÉGIA DE ARMAZENAMENTO POR SALA:
    // Purgar a mensagem mais antiga desta sala específica se exceder 500-1000 mensagens salvas por sala.
    // Usaremos o limite recomendado de 1000 mensagens por sala no banco de dados.
    const roomMessages = this.data.messages.filter(m => m.room_id === roomId);
    if (roomMessages.length > 1000) {
      const firstMsgIndex = this.data.messages.findIndex(m => m.room_id === roomId);
      if (firstMsgIndex !== -1) {
        const deletedMsg = this.data.messages.splice(firstMsgIndex, 1)[0];
        this.messagesMap.delete(deletedMsg.id);
      }
    }

    this.save();
    firestoreService.saveMessage(message);
    return message;
  }

  public deleteMessage(messageId: string): boolean {
    const msg = this.messagesMap.get(messageId);
    if (msg) {
      msg.hidden = true;
      this.save();
      firestoreService.saveMessage(msg);
      return true;
    }
    return false;
  }

  // --- SISTEMA DE INTERAÇÃO (LIKES, DISLIKES, DENÚNCIAS) ---

  public addInteraction(messageId: string, userId: string, ipAddress: string, type: "like" | "dislike" | "report"): Message {
    const msg = this.messagesMap.get(messageId);
    if (!msg) throw new Error("Mensagem não encontrada.");

    if (!msg.reactions) {
      msg.reactions = {};
    }

    if (type === "like" || type === "dislike") {
      const existingType = msg.reactions[userId];

      if (existingType === type) {
        // Toggle off if same reaction
        delete msg.reactions[userId];
        if (type === "like") msg.likes_count = Math.max(0, msg.likes_count - 1);
        if (type === "dislike") msg.dislikes_count = Math.max(0, msg.dislikes_count - 1);
        this.data.interactions = this.data.interactions.filter(i => !(i.message_id === messageId && i.user_id === userId && (i.type === "like" || i.type === "dislike")));
      } else {
        // Remove existing opposite if exists
        if (existingType) {
          if (existingType === "like") msg.likes_count = Math.max(0, msg.likes_count - 1);
          if (existingType === "dislike") msg.dislikes_count = Math.max(0, msg.dislikes_count - 1);
          this.data.interactions = this.data.interactions.filter(i => !(i.message_id === messageId && i.user_id === userId && (i.type === "like" || i.type === "dislike")));
        }

        // Add new reaction
        msg.reactions[userId] = type;
        if (type === "like") msg.likes_count += 1;
        if (type === "dislike") msg.dislikes_count += 1;
        
        this.data.interactions.push({
          id: uuidv4(),
          message_id: messageId,
          user_id: userId,
          type
        });
      }
    } else if (type === "report") {
      // Logic for reports - mostly managed by moderation-service, but keep for compatibility if needed directly via DB
      const existingReport = this.data.interactions.find(
        i => i.message_id === messageId && i.user_id === userId && i.type === "report"
      );
      
      if (!existingReport) {
        msg.reports_count += 1;
        if (msg.reports_count >= 5 && msg.moderation_status !== "ignored") {
          msg.hidden = true;
          msg.moderation_status = "pending";
        } else if (msg.moderation_status !== "ignored") {
           msg.moderation_status = "pending";
        }
        
        this.data.interactions.push({
          id: uuidv4(),
          message_id: messageId,
          user_id: userId,
          type: "report"
        });
      } else {
        throw new Error("Você já denunciou esta mensagem.");
      }
    }

    this.save();
    firestoreService.saveMessage(msg);
    return msg;
  }

  // --- LOGS DE AUDITORIA ---

  public addAuditLog(action: string, operator: string, targetId: string, details: string) {
    const log: AuditLog = {
      id: uuidv4(),
      action: action as any,
      operator,
      targetId,
      details,
      timestamp: new Date().toISOString()
    };
    if (!this.data.auditLogs) {
      this.data.auditLogs = [];
    }
    this.data.auditLogs.push(log);
    
    // Limitar log a 1000 registros para economizar memória do JSON
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs.shift();
    }
    this.save();
    firestoreService.saveConfig("auditLogs", { logs: this.data.auditLogs });
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs || [];
  }

  // --- AUTENTICAÇÃO E METRICS ---

  public testAdminLogin(pass: string): boolean {
    return bcrypt.compareSync(pass, this.data.adminConfig.hash);
  }

  public testModLogin(pass: string): boolean {
    return bcrypt.compareSync(pass, this.data.adminConfig.modHash);
  }

  public testOwnerLogin(pass: string): boolean {
    return bcrypt.compareSync(pass, this.data.adminConfig.ownerHash);
  }

  public getDashboardMetrics() {
    const messagesTodayCount = this.data.messages.filter(m => {
      const day = new Date(m.timestamp).toDateString();
      const today = new Date().toDateString();
      return day === today;
    }).length;

    const reportedMessagesList = this.data.messages.filter(m => m.reports_count > 0);

    return {
      activeUsersCount: Array.from(this.usersMap.values()).filter(u => u.status === "active").length,
      messagesTodayCount,
      reportedMessagesCount: reportedMessagesList.length,
      reportedMessages: reportedMessagesList
    };
  }

  public getReportedMessages(sortBy: "reports" | "likes" | "dislikes" = "reports"): Message[] {
    const reported = this.data.messages.filter(m => m.reports_count > 0 || (m.hidden && m.reports_count > 0));
    
    return reported.sort((a, b) => {
      if (sortBy === "reports") {
        return b.reports_count - a.reports_count;
      }
      if (sortBy === "likes") {
        return b.likes_count - a.likes_count;
      }
      if (sortBy === "dislikes") {
        return b.dislikes_count - a.dislikes_count;
      }
      return 0;
    });
  }

  public runPeriodicCleanup() {
    // Purga mensagens por sala (para manter no máximo 1000 mensagens por sala no arquivo)
    // Esse job em segundo plano garante a consistência e tamanho do DB.
    const rooms = this.getRooms();
    rooms.forEach(room => {
      const roomMsgs = this.data.messages.filter(m => m.room_id === room.id);
      if (roomMsgs.length > 1000) {
        const excess = roomMsgs.length - 1000;
        let pruned = 0;
        
        // Purgar os índices excedentes
        for (let i = 0; i < this.data.messages.length; i++) {
          if (this.data.messages[i].room_id === room.id) {
            const deleted = this.data.messages.splice(i, 1)[0];
            this.messagesMap.delete(deleted.id);
            pruned++;
            i--; // ajustar ponteiro
            if (pruned >= excess) break;
          }
        }
      }
    });
    return;
  }

  // --- CONFIGURAÇÕES DE LINKS EXTERNOS ---

  public getExternalLinks() {
    // Retorna as configurações ou valores default se não existir
    if (!this.data.externalLinks || (!this.data.externalLinks.egeGames && !this.data.externalLinks.escolaEGE && !this.data.externalLinks.salaProfessores)) {
      this.data.externalLinks = {
        egeGames: "https://games.ege.edu.br",
        escolaEGE: "https://escola.ege.edu.br",
        salaProfessores: "https://professores.ege.edu.br",
        diretrizesComunidade: "https://escola.ege.edu.br/diretrizes",
        privacidade: "https://escola.ege.edu.br/privacidade",
        manualModeracao: "https://escola.ege.edu.br/moderacao"
      };
      this.save();
      firestoreService.saveConfig("externalLinks", this.data.externalLinks);
    } else {
      // Garantir preenchimento retroativo se as novas chaves estiverem ausentes no objeto do banco
      let updated = false;
      if (this.data.externalLinks.diretrizesComunidade === undefined) {
        this.data.externalLinks.diretrizesComunidade = "https://escola.ege.edu.br/diretrizes";
        updated = true;
      }
      if (this.data.externalLinks.privacidade === undefined) {
        this.data.externalLinks.privacidade = "https://escola.ege.edu.br/privacidade";
        updated = true;
      }
      if (this.data.externalLinks.manualModeracao === undefined) {
        this.data.externalLinks.manualModeracao = "https://escola.ege.edu.br/moderacao";
        updated = true;
      }
      if (updated) {
        this.save();
        firestoreService.saveConfig("externalLinks", this.data.externalLinks);
      }
    }
    return this.data.externalLinks;
  }

  public updateExternalLinks(links: { egeGames?: string; escolaEGE?: string; salaProfessores?: string; diretrizesComunidade?: string; privacidade?: string; manualModeracao?: string }) {
    if (!this.data.externalLinks) {
      this.data.externalLinks = { 
        egeGames: "", 
        escolaEGE: "", 
        salaProfessores: "",
        diretrizesComunidade: "",
        privacidade: "",
        manualModeracao: "" 
      };
    }
    if (links.egeGames !== undefined) this.data.externalLinks.egeGames = links.egeGames;
    if (links.escolaEGE !== undefined) this.data.externalLinks.escolaEGE = links.escolaEGE;
    if (links.salaProfessores !== undefined) this.data.externalLinks.salaProfessores = links.salaProfessores;
    if (links.diretrizesComunidade !== undefined) this.data.externalLinks.diretrizesComunidade = links.diretrizesComunidade;
    if (links.privacidade !== undefined) this.data.externalLinks.privacidade = links.privacidade;
    if (links.manualModeracao !== undefined) this.data.externalLinks.manualModeracao = links.manualModeracao;
    
    this.save();
    firestoreService.saveConfig("externalLinks", this.data.externalLinks);
    return this.data.externalLinks;
  }

  // --- PALAVRAS PROIBIDAS ---
  public getProhibitedWords(): ProhibitedWord[] {
    return this.data.prohibitedWords || [];
  }

  public addProhibitedWord(word: string, severity: "block" | "warn"): ProhibitedWord {
    const cleanWord = word.trim().toLowerCase();
    if (!this.data.prohibitedWords) this.data.prohibitedWords = [];
    const exists = this.data.prohibitedWords.find(pw => pw.word.toLowerCase() === cleanWord);
    if (!exists) {
      this.data.prohibitedWords.push({ word: cleanWord, severity });
      this.save();
      firestoreService.saveConfig("prohibitedWords", { words: this.data.prohibitedWords });
    }
    return { word: cleanWord, severity };
  }

  public removeProhibitedWord(word: string): void {
    if (!this.data.prohibitedWords) return;
    const cleanWord = word.trim().toLowerCase();
    this.data.prohibitedWords = this.data.prohibitedWords.filter(pw => pw.word.toLowerCase() !== cleanWord);
    this.save();
    firestoreService.saveConfig("prohibitedWords", { words: this.data.prohibitedWords });
  }

  // --- GERENCIAMENTO DINÂMICO DE STAFF (ADMINS/MODERADORES) ---
  public getAdminUsers(): AdminUser[] {
    return Object.values(this.data.adminUsers || {});
  }

  public getAdminUser(username: string): AdminUser | undefined {
    const cleanName = username.trim().toLowerCase();
    return this.data.adminUsers?.[cleanName];
  }

  public addAdminUser(username: string, pass: string, role: "admin" | "moderator"): AdminUser {
    const cleanName = username.trim().toLowerCase();
    if (!this.data.adminUsers) this.data.adminUsers = {};
    
    const adminUser: AdminUser = {
      username: cleanName,
      hash: bcrypt.hashSync(pass, 10),
      role,
      createdAt: new Date().toISOString()
    };

    this.data.adminUsers[cleanName] = adminUser;
    this.save();
    firestoreService.saveConfig("adminUsers", { users: this.data.adminUsers });
    return adminUser;
  }

  public removeAdminUser(username: string): void {
    const cleanName = username.trim().toLowerCase();
    if (this.data.adminUsers?.[cleanName]) {
      delete this.data.adminUsers[cleanName];
      this.save();
      firestoreService.saveConfig("adminUsers", { users: this.data.adminUsers });
    }
  }
}

export const db = new Database();
