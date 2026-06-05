import React, { useState, useEffect } from "react";
import { Message, Room, User, AuditLog, DashboardMetrics } from "../types";
import {
  Trash2, VolumeX, Volume2, ShieldAlert, Lock, Unlock, Eye, BarChart2,
  Users, CheckCircle, TrendingUp, RefreshCw, Layers, Edit2, ShieldCheck, EyeOff, FileSpreadsheet,
  Link as LinkIcon, Copy, Filter, Search, ListPlus, Activity
} from "lucide-react";

interface AdminPanelProps {
  token: string | null;
  role: "owner" | "admin" | "moderator";
  onLogoutAdmin: () => void;
}

export default function AdminPanel({ token, role, onLogoutAdmin }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "moderation" | "users" | "rooms" | "auditLogs" | "config" | "prohibitedWords" | "roomAccess">("dashboard");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [reportedMessages, setReportedMessages] = useState<Message[]>([]);
  const [reportedSortBy, setReportedSortBy] = useState<"reports" | "likes" | "dislikes">("reports");
  const [usersList, setUsersList] = useState<User[]>([]);
  const [roomsList, setRoomsList] = useState<Room[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<AuditLog[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);

  // Prohibited Words State
  const [prohibitedWords, setProhibitedWords] = useState<{word: string, severity: "block" | "warn"}[]>([]);
  const [newProhibitedWord, setNewProhibitedWord] = useState("");
  const [newProhibitedSeverity, setNewProhibitedSeverity] = useState<"block" | "warn">("block");

  // Staff Management State
  const [staffList, setStaffList] = useState<{username: string, role: "admin" | "moderator", createdAt: string}[]>([]);
  const [newStaffUser, setNewStaffUser] = useState("");
  const [newStaffPass, setNewStaffPass] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"admin" | "moderator">("moderator");

  // Rooms Filters State
  const [roomSearch, setRoomSearch] = useState(() => {
    try { const saved = localStorage.getItem("admin_room_filters"); return saved ? JSON.parse(saved).roomSearch || "" : ""; } catch { return ""; }
  });
  const [roomSortBy, setRoomSortBy] = useState<"name" | "users" | "status">(() => {
    try { const saved = localStorage.getItem("admin_room_filters"); return saved ? JSON.parse(saved).roomSortBy || "name" : "name"; } catch { return "name"; }
  });
  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "hidden">(() => {
    try { const saved = localStorage.getItem("admin_room_filters"); return saved ? JSON.parse(saved).filterVisibility || "all" : "all"; } catch { return "all"; }
  });
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "read-only">(() => {
    try { const saved = localStorage.getItem("admin_room_filters"); return saved ? JSON.parse(saved).filterStatus || "all" : "all"; } catch { return "all"; }
  });
  const [filterSecurity, setFilterSecurity] = useState<"all" | "open" | "locked">(() => {
    try { const saved = localStorage.getItem("admin_room_filters"); return saved ? JSON.parse(saved).filterSecurity || "all" : "all"; } catch { return "all"; }
  });

  useEffect(() => {
    try {
      localStorage.setItem("admin_room_filters", JSON.stringify({
        roomSearch, roomSortBy, filterVisibility, filterStatus, filterSecurity
      }));
    } catch (e) {
      console.error("Failed to save admin filters to localStorage", e);
    }
  }, [roomSearch, roomSortBy, filterVisibility, filterStatus, filterSecurity]);

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCategory, setRoomCategory] = useState("Geral");
  const [roomStatus, setRoomStatus] = useState<"open" | "locked" | "read-only">("open");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "hidden">("public");
  const [roomPassword, setRoomPassword] = useState("");
  const [roomMaxUsers, setRoomMaxUsers] = useState(300);
  const [roomPinnedMessage, setRoomPinnedMessage] = useState("");
  const [roomCtaLink, setRoomCtaLink] = useState("");
  const [roomCtaText, setRoomCtaText] = useState("");

  // Room Access Metrics State
  const [selectedRoomForMetrics, setSelectedRoomForMetrics] = useState<string>("");
  const [roomAccessMetrics, setRoomAccessMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [topRooms, setTopRooms] = useState<any[]>([]);
  const [loadingTopRooms, setLoadingTopRooms] = useState(false);

  // Conversion Metrics State
  const [conversionMetrics, setConversionMetrics] = useState<any>(null);

  // Estados de Modais Rápidos
  const [quickLockRoom, setQuickLockRoom] = useState<Room | null>(null);
  const [quickLockPassword, setQuickLockPassword] = useState("");
  const [shareLinkRoom, setShareLinkRoom] = useState<Room | null>(null);
  const [renameRoom, setRenameRoom] = useState<Room | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const [confirmModal, setConfirmModal] = useState<{
    roomId: string;
    title: string;
    message: string;
    endpoint: string;
    body?: any;
  } | null>(null);

  const [externalLinks, setExternalLinks] = useState({ 
    egeGames: "", 
    escolaEGE: "", 
    salaProfessores: "",
    diretrizesComunidade: "",
    privacidade: "",
    manualModeracao: ""
  });

  const loadDashboardData = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const resMetrics = await fetch("/api/admin/dashboard", { headers });
      const metricsData = await resMetrics.json();
      
      setMetrics((prev) => {
        if (prev && metricsData.reportedMessagesCount > prev.reportedMessagesCount) {
          showStatus("🚨 Nova denúncia de mensagem detectada! Verifique a Fila de Moderação.", "error");
        }
        return metricsData;
      });

      const resReported = await fetch(`/api/admin/messages/reported?sortBy=${reportedSortBy}`, { headers });
      const reportedData = await resReported.json();
      setReportedMessages(reportedData);

      const resUsers = await fetch("/api/admin/users", { headers });
      const usersData = await resUsers.json();
      setUsersList(usersData);

      const resRooms = await fetch("/api/rooms");
      const roomsData = await resRooms.json();
      setRoomsList(roomsData);

      const resLogs = await fetch("/api/admin/logs", { headers });
      if (resLogs.ok) {
        const logsData = await resLogs.json();
        setAuditLogsList(logsData);
      }

      const resConversions = await fetch("/api/admin/metrics/conversions", { headers });
      if (resConversions.ok) {
        setConversionMetrics(await resConversions.json());
      }

      const resLinks = await fetch("/api/external-links");
      if (resLinks.ok) {
        setExternalLinks(await resLinks.json());
      }

      const resPw = await fetch("/api/admin/prohibited-words", { headers });
      if (resPw.ok) {
        setProhibitedWords(await resPw.json());
      }

      if (role === "owner") {
        const resStaff = await fetch("/api/admin/staff", { headers });
        if (resStaff.ok) {
          setStaffList(await resStaff.json());
        }
      }

    } catch (err) {
      console.error("Erro ao carregar dados do admin portal:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(() => loadDashboardData(true), 15000);
    return () => clearInterval(interval);
  }, [token, reportedSortBy, activeTab]);

  const showStatus = (msg: string, type: "success" | "error" = "success") => {
    setStatusMessage(msg);
    setStatusType(type);
    setTimeout(() => {
      setStatusMessage("");
      setStatusType("success");
    }, 4000);
  };

  // AÇÕES DO MODERADOR/ADMIN
  const handleDeleteMessage = async (messageId: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/message/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messageId })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Mensagem apagada e ocultada com sucesso!");
        loadDashboardData();
      } else {
        showStatus(`Falha: ${data.error}`);
      }
    } catch (e) {
      showStatus("Ocorreu um erro técnico.");
    }
  };

  const handleIgnoreReport = async (messageId: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/message/ignore-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messageId })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Denúncia ignorada com sucesso.");
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Ocorreu um erro técnico.");
    }
  };

  const handleMuteUser = async (userId: string, currentStatus: string) => {
    if (!token) return;
    const targetStatus = currentStatus === "muted" ? "active" : "muted";
    try {
      const res = await fetch("/api/admin/user/mute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId, status: targetStatus })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Status do usuário alterado para ${targetStatus === "muted" ? "SILENCIADO" : "ATIVO"}`);
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Falha ao comunicar com o servidor.");
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!token) return;
    const confirmBan = window.confirm("Você tem certeza de que deseja BANIR permanentemente este usuário (UUID e IP associado)?");
    if (!confirmBan) return;

    try {
      const res = await fetch("/api/admin/user/ban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId, reason: "Abuso ou comportamento inadequado" })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Usuário e IP associados foram banidos!");
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Erro ao banir usuário.");
    }
  };

  const handleUnbanUser = async (userId: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/user/unban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Banimento removido com sucesso.");
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Erro ao desbanir.");
    }
  };

  // EXCLUSIVAS DO DONO (OWNER) - GERENCIAR MODERADORES
  const handlePromoteUser = async (userId: string) => {
    if (!token || role !== "owner") return;
    const confirmPromote = window.confirm("Deseja promover este acadêmico a Moderador permanente?");
    if (!confirmPromote) return;

    try {
      const res = await fetch("/api/admin/user/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Usuário promovido a Moderador com sucesso!");
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Erro técnico ao promover usuário.");
    }
  };

  const handleDemoteUser = async (userId: string) => {
    if (!token || role !== "owner") return;
    const confirmDemote = window.confirm("Tem certeza de que deseja rebaixar este Moderador para acadêmico comum?");
    if (!confirmDemote) return;

    try {
      const res = await fetch("/api/admin/user/demote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("Moderador rebaixado a usuário comum com sucesso.");
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Erro técnico ao rebaixar usuário.");
    }
  };

  const fetchRoomMetrics = async (roomId: string) => {
    if (!token || !roomId) return;
    setLoadingMetrics(true);
    try {
      const res = await fetch(`/api/admin/room-access/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setRoomAccessMetrics(data);
      } else {
        showStatus(data.error || "Erro ao carregar métricas.", "error");
      }
    } catch (err) {
      showStatus("Erro técnico ao buscar métricas.", "error");
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchTopRooms = async () => {
    if (!token) return;
    setLoadingTopRooms(true);
    try {
      const res = await fetch("/api/admin/top-rooms-today?limit=10", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTopRooms(data);
      } else {
        showStatus(data.error || "Erro ao carregar ranking de salas.", "error");
      }
    } catch (err) {
      showStatus("Erro técnico ao buscar ranking de salas.", "error");
    } finally {
      setLoadingTopRooms(false);
    }
  };

  useEffect(() => {
    if (activeTab === "roomAccess") {
      fetchTopRooms();
    }
  }, [activeTab]);

  // EDICAO DE SALA
  const handleRoomEditorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingRoom) return;

    try {
      const res = await fetch("/api/admin/rooms/update", {
        body: JSON.stringify({
          roomId: editingRoom.id,
          name: roomName,
          status: roomStatus,
          visibility: roomVisibility,
          password: roomStatus === "locked" ? roomPassword : undefined,
          max_users: roomMaxUsers,
          pinnedMessage: roomPinnedMessage,
          ctaLink: roomCtaLink,
          ctaText: roomCtaText
        })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Sala "${roomName}" atualizada com sucesso no banco de dados!`);
        setEditingRoom(null);
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Falha ao salvar configuração da sala.");
    }
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch("/api/admin/rooms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: roomName,
          category: roomCategory,
          status: roomStatus,
          visibility: roomVisibility,
          password: roomStatus === "locked" ? roomPassword : undefined,
          max_users: roomMaxUsers,
          pinnedMessage: roomPinnedMessage,
          ctaLink: roomCtaLink,
          ctaText: roomCtaText
        })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(`Sala "${roomName}" criada com sucesso!`);
        setIsCreatingRoom(false);
        loadDashboardData();
      } else {
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Falha ao criar sala.");
    }
  };

  const openRoomEditor = (room: Room) => {
    setEditingRoom(room);
    setRoomName(room.name);
    setRoomCategory(room.category || "Geral");
    setRoomStatus(room.status);
    setRoomVisibility(room.visibility || "public");
    setRoomPassword(room.password || "123456");
    setRoomMaxUsers(room.max_users);
    setRoomPinnedMessage(room.pinnedMessage || "");
    setRoomCtaLink(room.ctaLink || "");
    setRoomCtaText(room.ctaText || "");
  };
  
  const openRoomCreator = () => {
    setIsCreatingRoom(true);
    setRoomName("");
    setRoomCategory("Geral");
    setRoomStatus("open");
    setRoomVisibility("public");
    setRoomPassword("");
    setRoomMaxUsers(300);
    setRoomPinnedMessage("");
    setRoomCtaLink("");
    setRoomCtaText("");
  };

  const handleDeleteRoom = (room: Room) => {
    setConfirmModal({
      roomId: room.id,
      title: "Deletar Sala",
      message: `Tem certeza que deseja deletar permanentemente a sala "${room.name}" e todas as suas mensagens? Esta ação é irreversível.`,
      endpoint: "/api/admin/rooms/delete",
      body: { roomId: room.id }
    });
  };

  const saveExternalLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showStatus("Erro: Token de autenticação ausente. Faça login novamente.", "error");
      return;
    }
    try {
      console.log("[ADMIN] Enviando links externos:", externalLinks);

      const res = await fetch("/api/admin/external-links", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(externalLinks)
      });

      const rawText = await res.text();
      console.log("[ADMIN] HTTP Status para links externos:", res.status);
      console.log("[ADMIN] Resposta bruta de links externos:", rawText.substring(0, 500));

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("[ADMIN] Falha ao parsear JSON dos links externos:", rawText.substring(0, 300));
        showStatus(`Erro ${res.status}: Servidor retornou resposta inválida (não-JSON).`, "error");
        return;
      }

      if (res.ok) {
        showStatus("✅ Links externos salvos com sucesso!");
      } else {
        console.error("[ADMIN] Erro retornado pela API de links:", data);
        showStatus(`Erro ${res.status}: ${data.error || JSON.stringify(data)}`, "error");
      }
    } catch (err: any) {
      console.error("[ADMIN] Falha ao salvar links (Fetch Error):", err);
      showStatus(`Erro de conexão: ${err.message || "Falha de rede"}.`, "error");
    }
  };

  const handleAddProhibitedWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showStatus("Erro: Token de autenticação ausente. Faça login novamente.");
      return;
    }
    const trimmedWord = newProhibitedWord.trim();
    if (!trimmedWord) {
      showStatus("Erro: Digite uma palavra antes de adicionar.");
      return;
    }

    try {
      console.log("[ADMIN] Enviando palavra:", trimmedWord, "severidade:", newProhibitedSeverity, "token (primeiros 20 chars):", token.substring(0, 20) + "...");

      const res = await fetch("/api/admin/prohibited-words", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ word: trimmedWord, severity: newProhibitedSeverity })
      });

      // Ler como texto PRIMEIRO para diagnóstico
      const rawText = await res.text();
      console.log("[ADMIN] HTTP Status:", res.status);
      console.log("[ADMIN] Resposta bruta do servidor:", rawText.substring(0, 500));

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("[ADMIN] Falha ao parsear JSON. Resposta recebida:", rawText.substring(0, 300));
        showStatus(`Erro ${res.status}: Servidor retornou resposta inválida (não-JSON). Verifique o console.`);
        return;
      }

      if (res.ok) {
        showStatus("✅ Palavra proibida adicionada com sucesso!");
        setNewProhibitedWord("");
        loadDashboardData();
      } else {
        console.error("[ADMIN] Erro retornado pela API:", data);
        showStatus(`Erro ${res.status}: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e: any) {
      console.error("[ADMIN] Falha de rede (Fetch Error):", e);
      showStatus(`Erro de conexão: ${e.message || "Falha de rede"}.`);
    }
  };

  const handleRemoveProhibitedWord = async (word: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/prohibited-words", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ word })
      });
      if (res.ok) {
        showStatus("Palavra removida.");
        loadDashboardData();
      }
    } catch (e) {
      showStatus("Erro de conexão.");
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || role !== "owner") return;

    const username = newStaffUser.trim();
    const password = newStaffPass.trim();

    if (!username || !password) {
      showStatus("Login e senha são obrigatórios.", "error");
      return;
    }

    try {
      const res = await fetch("/api/admin/staff/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username, password, role: newStaffRole })
      });

      const data = await res.json();
      if (res.ok) {
        showStatus("Colaborador cadastrado com sucesso!");
        setNewStaffUser("");
        setNewStaffPass("");
        loadDashboardData();
      } else {
        showStatus(data.error || "Erro ao cadastrar.", "error");
      }
    } catch (err) {
      showStatus("Erro de conexão.", "error");
    }
  };

  const handleDeleteStaff = async (username: string) => {
    if (!token || role !== "owner") return;
    const confirmDelete = window.confirm(`Deseja remover permanentemente o acesso do colaborador "${username}"?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/admin/staff/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      });

      if (res.ok) {
        showStatus("Colaborador removido com sucesso!");
        loadDashboardData();
      } else {
        const data = await res.json();
        showStatus(data.error || "Erro ao remover.", "error");
      }
    } catch (err) {
      showStatus("Erro de conexão.", "error");
    }
  };

  // Memoized Rooms Filter
  const filteredRooms = React.useMemo(() => {
    let result = roomsList;

    // Search Filter
    if (roomSearch.trim()) {
      const lowerSearch = roomSearch.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(lowerSearch) || r.id.toLowerCase().includes(lowerSearch));
    }

    // Dropdown Filters
    if (filterVisibility !== "all") {
      result = result.filter(r => r.visibility === filterVisibility);
    }
    if (filterStatus !== "all") {
      if (filterStatus === "active") result = result.filter(r => r.status !== "read-only");
      if (filterStatus === "read-only") result = result.filter(r => r.status === "read-only");
    }
    if (filterSecurity !== "all") {
      if (filterSecurity === "open") result = result.filter(r => r.status !== "locked");
      if (filterSecurity === "locked") result = result.filter(r => r.status === "locked");
    }

    // Sort
    return result.sort((a, b) => {
      if (roomSortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (roomSortBy === "users") {
        return b.current_users - a.current_users;
      } else if (roomSortBy === "status") {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });
  }, [roomsList, roomSearch, filterVisibility, filterStatus, filterSecurity, roomSortBy]);

  // --- NOVAS AÇÕES (QUICK ACTIONS EXATAS) ---
  const handleGenericAction = async (endpoint: string, bodyData: any, successMsg: string) => {
    if (!token) return;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(bodyData)
      });
      if (res.ok) {
        showStatus(successMsg);
        loadDashboardData();
        setConfirmModal(null);
        setQuickLockRoom(null);
        setRenameRoom(null);
      } else {
        const data = await res.json();
        showStatus(`Erro: ${data.error}`);
      }
    } catch (e) {
      showStatus("Erro ao comunicar com o servidor.");
    }
  };

  const handleToggleVisibility = (room: Room) => {
    if (room.visibility === "hidden") {
      setConfirmModal({
        roomId: room.id,
        title: "Tornar Sala Pública",
        message: "Tem certeza que deseja tornar esta sala visível na listagem de todos os estudantes?",
        endpoint: "/api/admin/rooms/toggle-visibility",
        body: { roomId: room.id }
      });
    } else {
      handleGenericAction("/api/admin/rooms/toggle-visibility", { roomId: room.id }, "Sala oculta com sucesso!");
    }
  };

  const handleToggleMute = (room: Room) => {
    if (room.status === "read-only") {
      setConfirmModal({
        roomId: room.id,
        title: "Liberar Chat (Desmutar)",
        message: "Tem certeza que deseja liberar esta sala para envio de novas mensagens acadêmicas?",
        endpoint: "/api/admin/rooms/toggle-mute",
        body: { roomId: room.id }
      });
    } else {
      handleGenericAction("/api/admin/rooms/toggle-mute", { roomId: room.id }, "Sala silenciada (read-only) com sucesso!");
    }
  };

  const handleToggleLockQuick = (room: Room) => {
    if (room.status === "locked") {
      setConfirmModal({
        roomId: room.id,
        title: "Destrancar Sala",
        message: "Tem certeza que deseja remover a senha e liberar a entrada nesta sala?",
        endpoint: "/api/admin/rooms/remove-password",
        body: { roomId: room.id }
      });
    } else {
      setQuickLockPassword("123456");
      setQuickLockRoom(room);
    }
  };

  const submitQuickLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLockRoom) return;
    handleGenericAction("/api/admin/rooms/set-password", { roomId: quickLockRoom.id, password: quickLockPassword }, "Sala trancada com sucesso!");
  };

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameRoom) return;
    handleGenericAction("/api/admin/rooms/rename", { roomId: renameRoom.id, newName: renameInput }, "Nome da sala alterado com sucesso!");
  };

  const copyShareLink = () => {
    if (!shareLinkRoom) return;
    const link = `${window.location.origin}/chat?room=${encodeURIComponent(shareLinkRoom.name)}`;
    navigator.clipboard.writeText(link).then(() => {
      showStatus("Link copiado com sucesso!");
    }).catch(() => {
      showStatus("Erro ao copiar o link para a área de transferência.");
    });
  };

  const translateRole = (r: string) => {
    switch (r) {
      case "owner":
        return "Dono (Owner)";
      case "admin":
        return "Administrador";
      case "moderator":
        return "Moderador";
      case "user":
        return "Acadêmico";
      default:
        return r;
    }
  };

  const translateAuditAction = (action: string) => {
    switch (action) {
      case "delete_message":
        return "Excluir Mensagem";
      case "ban_user":
        return "Banir Usuário";
      case "mute_user":
        return "Silenciar Usuário";
      case "unban_user":
        return "Desbanir Usuário";
      case "update_room":
        return "Alterar Sala";
      case "promote_moderator":
        return "Promover Moderador";
      case "demote_moderator":
        return "Rebaixar Moderador";
      default:
        return action;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full font-sans select-none" id="admin_panel_root">
      {/* Barra de Status */}
      <div className="flex justify-between items-center bg-[#1c1c17] text-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#775a19] flex items-center justify-center font-bold font-serif text-sm">
            EA
          </div>
          <div>
            <h2 className="font-serif font-bold text-sm tracking-wide">Painel de Controle EGE Admin</h2>
            <p className="text-[11px] text-[#ebe8df] opacity-85">
              Modo de acesso: <span className="font-bold underline uppercase text-amber-400">{translateRole(role)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            className="p-2 bg-[#4e4639] hover:bg-[#775a19] rounded-lg transition-colors cursor-pointer text-[#fcf9f0]"
            title="Atualizar dados agora"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          
          <button
            onClick={onLogoutAdmin}
            className="px-3.5 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg text-xs font-bold font-sans cursor-pointer transition-colors shadow-sm"
          >
            Sair do Admin
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-3 rounded-lg text-xs font-bold font-sans animate-fade-in border flex items-center gap-2 ${
          statusType === "error"
            ? "bg-red-50 border-red-200 text-red-900"
            : "bg-[#b9eeab] border-[#3f6d38] text-[#002201]"
        }`} id="status_alert_box">
          <span>{statusType === "error" ? "⚠️" : "✅"}</span>
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Menu de Abas */}
      <div className="flex gap-2 border-b border-[#ebe8df] pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "dashboard"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab("moderation")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "moderation"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Fila de Moderação</span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "users"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Acadêmicos</span>
        </button>
        <button
          onClick={() => setActiveTab("rooms")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "rooms"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Gerenciar Salas</span>
        </button>
        <button
          onClick={() => setActiveTab("auditLogs")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "auditLogs"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5" /> Auditoria</span>
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "config"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Links Externos</span>
        </button>
        <button
          onClick={() => setActiveTab("prohibitedWords")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "prohibitedWords"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><ListPlus className="w-3.5 h-3.5" /> Palavras Proibidas</span>
        </button>
        <button
          onClick={() => setActiveTab("roomAccess")}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "roomAccess"
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Métricas de Acesso</span>
        </button>
        <button
          onClick={() => setActiveTab("conversions" as any)}
          className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            activeTab === "conversions" as any
              ? "border-[#775a19] text-[#775a19]"
              : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
          }`}
        >
          <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Conversão (CTAs)</span>
        </button>

        {role === "owner" && (
          <button
            onClick={() => setActiveTab("staff" as any)}
            className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === ("staff" as any)
                ? "border-[#775a19] text-[#775a19]"
                : "border-transparent text-[#7f7667] hover:text-[#1c1c17]"
            }`}
          >
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Gerenciar Equipe</span>
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center p-8 text-[#7f7667] text-xs font-sans animate-pulse">
          Sincronizando dados administrativos com o servidor...
        </div>
      )}

      {/* CONVERSIONS VIEW */}
      {!loading && activeTab === "conversions" as any && (
        <div className="space-y-6 animate-fade-in">
          {conversionMetrics ? (
            <>
              {/* Resumo de Conversão */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#ffffff] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm col-span-1 md:col-span-2">
                  <div>
                    <h3 className="text-xs font-sans font-bold text-[#7f7667] uppercase tracking-widest mb-1">Total de Cliques Hoje</h3>
                    <p className="text-3xl font-bold font-sans text-[#4e4639]">{conversionMetrics.total}</p>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#3b6934] animate-pulse"></span>
                    <span className="text-xs font-bold font-sans text-[#3b6934]">Estatísticas Online</span>
                  </div>
                </div>

                {/* Por Tipo de Gatilho */}
                <div className="bg-[#ffffff] border border-[#ebe8df] p-6 rounded-2xl shadow-sm col-span-1 md:col-span-2 flex flex-col justify-center">
                  <h3 className="text-xs font-sans font-bold text-[#7f7667] uppercase tracking-widest mb-4">Cliques por Tipo de Gatilho</h3>
                  
                  {(() => {
                    const pinned = conversionMetrics.byTrigger?.pinned || 0;
                    const time = conversionMetrics.byTrigger?.time || 0;
                    const interaction = conversionMetrics.byTrigger?.interaction || 0;
                    const maxClicks = Math.max(pinned, time, interaction, 1);
                    const types = [
                      { key: "interaction", label: "Interação (10 msgs)", count: interaction },
                      { key: "pinned", label: "Mensagem Fixa (Topo)", count: pinned },
                      { key: "time", label: "Tempo (5 min)", count: time }
                    ].sort((a,b) => b.count - a.count);

                    return (
                      <div className="space-y-3">
                        {types.map((t, idx) => (
                          <div key={t.key} className="flex items-center gap-3">
                            <span className="w-32 text-xs font-bold text-[#4e4639] truncate" title={t.label}>{t.label}</span>
                            <div className="flex-1 bg-[#ebe8df] h-3 rounded-full overflow-hidden">
                              <div className="bg-[#775a19] h-full" style={{ width: `${(t.count / maxClicks) * 100}%` }}></div>
                            </div>
                            <span className="w-8 text-xs font-bold text-right">{t.count}</span>
                            {idx === 0 && t.count > 0 && (
                              <span className="bg-[#775a19] text-white px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase whitespace-nowrap">🔥 Melhor</span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Ranking por Sala */}
              <div className="bg-[#ffffff] border border-[#ebe8df] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#ebe8df] flex justify-between items-center bg-[#fbf8f0]">
                  <h3 className="text-sm font-sans font-bold text-[#4e4639]">Ranking de Salas por Conversão (Hoje)</h3>
                </div>
                {Object.keys(conversionMetrics.byRoom || {}).length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold font-sans text-[#7f7667]">
                    Nenhum clique registrado hoje.
                  </div>
                ) : (
                  <div className="divide-y divide-[#ebe8df]">
                    {Object.entries(conversionMetrics.byRoom)
                      .sort((a: any, b: any) => b[1] - a[1])
                      .map(([roomId, count]: any, idx: number) => (
                      <div key={roomId} className="px-6 py-4 flex items-center justify-between hover:bg-[#fcf9f0] transition-colors">
                        <div className="flex items-center gap-3">
                           <span className="w-6 text-center font-bold text-[#a09787] text-sm">#{idx + 1}</span>
                           <div>
                             <p className="font-bold text-sm text-[#4e4639]">{(roomsList.find(r => r.id === roomId)?.name) || "Sala Excluída"}</p>
                             <p className="text-xs text-[#7f7667]">{roomId}</p>
                           </div>
                        </div>
                        <div className="flex flex-col items-end">
                           <span className="font-bold text-sm text-[#3b6934]">{count} cliques</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center p-8 text-[#7f7667] text-xs font-sans">Carregando métricas de conversão...</div>
          )}
        </div>
      )}

      {/* DASHBOARD VIEW */}
      {!loading && activeTab === "dashboard" && (
        <div className="space-y-6 animate-fade-in" id="admin_dashboard_view">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#ffffff] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7f7667]">Acadêmicos Ativos</span>
                <span className="p-1.5 bg-[#b9eeab] rounded-lg text-[#3f6d38] font-bold text-[10px] flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +12%
                </span>
              </div>
              <p className="font-serif font-bold text-3xl text-[#1c1c17]">
                {metrics?.activeUsersCount || usersList.length || 0}
              </p>
            </div>

            <div className="bg-[#ffffff] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7f7667]">Mensagens Hoje</span>
                <span className="p-1.5 bg-[#b9eeab] rounded-lg text-[#3f6d38] font-bold text-[10px] flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> +5%
                </span>
              </div>
              <p className="font-serif font-bold text-3xl text-[#1c1c17]">
                {metrics?.messagesTodayCount || 0}
              </p>
            </div>

            <div className="bg-[#ffffff] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7f7667]">Mensagens Denunciadas</span>
                <span className="p-1.5 bg-[#ffdad6] rounded-lg text-red-700 font-bold text-[10px]">
                  Alerta
                </span>
              </div>
              <p className="font-serif font-bold text-3xl text-[red]">
                {metrics?.reportedMessagesCount || reportedMessages.length || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-sm">
            <h3 className="font-serif font-bold text-sm text-[#1c1c17] mb-4">Volume de Tráfego de Mensagens Semanais</h3>
            
            <div className="flex items-end justify-between h-40 pt-4 px-4 border-b border-[#ebe8df]">
              <div className="w-[10%] bg-[#775a19]/40 hover:bg-[#775a19]/60 rounded-t-lg h-[40%] transition-all cursor-pointer" title="Seg: 4k"></div>
              <div className="w-[10%] bg-[#775a19]/50 hover:bg-[#775a19]/70 rounded-t-lg h-[65%] transition-all cursor-pointer" title="Ter: 6k"></div>
              <div className="w-[10%] bg-[#775a19]/45 hover:bg-[#775a19]/65 rounded-t-lg h-[50%] transition-all cursor-pointer" title="Qua: 5k"></div>
              <div className="w-[10%] bg-[#775a19] hover:brightness-110 rounded-t-lg h-[85%] transition-all cursor-pointer" title="Qui: 8k"></div>
              <div className="w-[10%] bg-[#775a19]/80 hover:bg-[#775a19] rounded-t-lg h-[70%] transition-all cursor-pointer" title="Sex: 7k"></div>
              <div className="w-[10%] bg-[#775a19]/30 hover:bg-[#775a19]/50 rounded-t-lg h-[25%] transition-all cursor-pointer" title="Sab: 2k"></div>
              <div className="w-[10%] bg-[#775a19]/40 hover:bg-[#775a19]/60 rounded-t-lg h-[45%] transition-all cursor-pointer" title="Dom: 4k"></div>
            </div>
            
            <div className="flex justify-between font-sans text-[10px] text-[#7f7667] font-semibold mt-2 px-4">
              <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sab</span><span>Dom</span>
            </div>
          </div>
        </div>
      )}

      {/* FILA DE MODERAÇÃO */}
      {!loading && activeTab === "moderation" && (
        <div className="space-y-4 animate-fade-in" id="admin_moderation_view">
          <div className="flex justify-between items-center bg-[#fbf8f0] p-3 rounded-xl border border-[#ebe8df]">
            <h3 className="font-serif font-bold text-[#1c1c17] text-sm">Fila Reativa de Abusos e Denúncias</h3>
            
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-sans font-semibold text-[#7f7667] mr-1">Ordenar por:</span>
              <button
                onClick={() => setReportedSortBy("reports")}
                className={`px-3 py-1 rounded text-[10px] font-bold ${
                  reportedSortBy === "reports" ? "bg-[#775a19] text-white" : "bg-[#ebe8df] text-[#4e4639]"
                }`}
              >
                Denúncias
              </button>
              <button
                onClick={() => setReportedSortBy("likes")}
                className={`px-3 py-1 rounded text-[10px] font-bold ${
                  reportedSortBy === "likes" ? "bg-[#775a19] text-white" : "bg-[#ebe8df] text-[#4e4639]"
                }`}
              >
                Likes
              </button>
            </div>
          </div>

          {reportedMessages.length === 0 ? (
            <div className="bg-white p-8 border border-[#ebe8df] rounded-2xl text-center text-[#7f7667] text-xs font-sans">
              🎉 Nenhuma mensagem denunciada sob revisão de abuso no momento. Ótimo convívio acadêmico!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {reportedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-white p-4 border border-[#ebe8df] rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-xs hover:border-[#775a19]/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs font-sans text-[#1c1c17]">{msg.username}</span>
                      <span className="text-[10px] font-mono text-[#7f7667]/75">ID: {msg.user_id.slice(0, 8)}...</span>
                      <span className="px-2 py-0.5 bg-[#ffdad6] text-red-800 rounded font-bold text-[9px] uppercase">
                        Denúncias: {msg.reports_count}
                      </span>
                      {msg.hidden && (
                        <span className="px-2 py-0.5 bg-red-700 text-white rounded font-bold text-[9px] uppercase">
                          Ocultada
                        </span>
                      )}
                    </div>
                    <p className="font-sans text-xs bg-[#fcf9f0] p-2.5 rounded-lg text-[#1c1c17] italic border border-[#ebe8df]/40 break-all">
                      "{msg.content}"
                    </p>
                    <p className="font-sans text-[10px] text-[#7f7667]">
                      Data: {new Date(msg.timestamp).toLocaleString("pt-BR")} • Sala: {msg.room_id} • Likes: {msg.likes_count} • Dislikes: {msg.dislikes_count}
                    </p>
                  </div>

                  <div className="flex gap-1 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => handleIgnoreReport(msg.id)}
                      className="p-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-600 hover:text-white rounded-lg transition-all cursor-pointer shadow-xs"
                      title="Ignorar Denúncia (Resetar status)"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="p-2 bg-[#ffdad6] text-red-900 hover:bg-[#ba1a1a] hover:text-white rounded-lg transition-all cursor-pointer shadow-xs"
                      title="Apagar Mensagem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMuteUser(msg.user_id, "active")}
                      className="p-2 bg-[#ffdea5] text-[#4e3700] hover:bg-[#c5a059] hover:text-white rounded-lg transition-all cursor-pointer shadow-xs"
                      title="Silenciar Usuário"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleBanUser(msg.user_id)}
                      className="p-2 bg-red-100 text-red-800 hover:bg-red-800 hover:text-white rounded-lg transition-all cursor-pointer shadow-xs"
                      title="Banir Usuário IP + UUID"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GERENCIAMENTO DE ACADÊMICOS */}
      {!loading && activeTab === "users" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm overflow-hidden animate-fade-in" id="admin_users_view">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#f6f3ea] border-b border-[#ebe8df] text-[#4e4639] font-bold">
                <tr>
                  <th className="py-3 px-4">Nome de Usuário</th>
                  <th className="py-3 px-4">UUID ID</th>
                  <th className="py-3 px-4">Endereço IP</th>
                  <th className="py-3 px-4">Nível de Acesso</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações de Controle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebe8df]">
                {usersList.map((user) => (
                  <tr key={user.id} className="hover:bg-[#fcf9f0] transition-colors">
                    <td className="py-3 px-4 font-bold text-[#1c1c17]">{user.username}</td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[#7f7667]">{user.id.slice(0, 15)}...</td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[#4e4639]">{user.ip_address}</td>
                    <td className="py-3 px-4 font-bold text-xs uppercase text-[#775a19]">{translateRole(user.role)}</td>
                    <td className="py-3 px-4">
                      {user.status === "banned" ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 font-bold rounded">BANIDO</span>
                      ) : user.status === "muted" ? (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">SILENCIADO</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">ATIVO</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 shrink-0 whitespace-nowrap">
                      {/* Silenciar */}
                      <button
                        onClick={() => handleMuteUser(user.id, user.status)}
                        className={`px-2 py-1 rounded font-bold text-[10px] shadow-xs cursor-pointer ${
                          user.status === "muted" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        }`}
                      >
                        {user.status === "muted" ? <Volume2 className="w-3 h-3 inline mr-0.5" /> : <VolumeX className="w-3 h-3 inline mr-0.5" />}
                        {user.status === "muted" ? "Desmutar" : "Silenciar"}
                      </button>

                      {/* Banir / Desbanir */}
                      {user.status === "banned" ? (
                        <button
                          onClick={() => handleUnbanUser(user.id)}
                          className="px-2 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded font-bold text-[10px] shadow-xs cursor-pointer inline-flex items-center gap-0.5"
                        >
                          <ShieldCheck className="w-3 h-3" /> Desbanir
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBanUser(user.id)}
                          className="px-2 py-1 bg-red-100 text-red-800 hover:bg-red-800 hover:text-white rounded font-bold text-[10px] shadow-xs cursor-pointer"
                        >
                          Banir
                        </button>
                      )}

                      {/* Ações exclusivas do Dono (Promover/Rebaixar Moderadores) */}
                      {role === "owner" && user.role !== "owner" && user.role !== "admin" && (
                        <>
                          {user.role === "moderator" ? (
                            <button
                              onClick={() => handleDemoteUser(user.id)}
                              className="px-2 py-1 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded font-bold text-[10px] shadow-xs cursor-pointer inline-flex items-center"
                            >
                              Rebaixar a Usuário
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePromoteUser(user.id)}
                              className="px-2 py-1 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded font-bold text-[10px] shadow-xs cursor-pointer inline-flex items-center"
                            >
                              Promover a Mod
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GERENCIAMENTO DE SALAS */}
      {!loading && activeTab === "rooms" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm overflow-hidden animate-fade-in" id="admin_rooms_view">
          {/* SEARCH & FILTERS CONTROLS */}
          <div className="p-4 bg-[#fcf9f0] border-b border-[#ebe8df] flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7f7667]" />
                <input
                  type="text"
                  placeholder="Buscar sala por nome ou ID..."
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                />
              </div>
              <span className="text-xs text-[#7f7667] font-bold">
                Resultados: <span className="text-[#1c1c17]">{filteredRooms.length}</span>
              </span>
              {(roomSearch || filterVisibility !== "all" || filterStatus !== "all" || filterSecurity !== "all") && (
                <button
                  onClick={() => {
                    setRoomSearch(""); setFilterVisibility("all"); setFilterStatus("all"); setFilterSecurity("all");
                  }}
                  className="ml-auto text-xs text-[#775a19] font-bold hover:underline"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#7f7667]" />
                <span className="text-[10px] font-bold uppercase text-[#7f7667]">Ordenar por:</span>
                <select value={roomSortBy} onChange={e => setRoomSortBy(e.target.value as any)} className="text-xs bg-white border border-[#d1c5b4] rounded p-1 outline-none">
                  <option value="name">Nome (A-Z)</option>
                  <option value="users">Usuários Ativos</option>
                  <option value="status">Status</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#7f7667]">Visibilidade:</span>
                <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value as any)} className="text-xs bg-white border border-[#d1c5b4] rounded p-1 outline-none">
                  <option value="all">Todas</option>
                  <option value="public">Públicas</option>
                  <option value="hidden">Ocultas</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#7f7667]">Estado:</span>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="text-xs bg-white border border-[#d1c5b4] rounded p-1 outline-none">
                  <option value="all">Todos</option>
                  <option value="active">Ativas</option>
                  <option value="read-only">Silenciadas</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#7f7667]">Segurança:</span>
                <select value={filterSecurity} onChange={e => setFilterSecurity(e.target.value as any)} className="text-xs bg-white border border-[#d1c5b4] rounded p-1 outline-none">
                  <option value="all">Todas</option>
                  <option value="open">Abertas</option>
                  <option value="locked">Trancadas</option>
                </select>
              </div>

              {(role === "owner" || role === "admin") && (
                <button 
                  onClick={openRoomCreator}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#775a19] text-white hover:brightness-105 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" /> Nova Sala
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#f6f3ea] border-b border-[#ebe8df] text-[#4e4639] font-bold">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Nome da Sala</th>
                  <th className="py-3 px-4">Categoria Acadêmica</th>
                  <th className="py-3 px-4">Privacidade</th>
                  <th className="py-3 px-4">Visibilidade</th>
                  <th className="py-3 px-4">Chave de Acesso</th>
                  <th className="py-3 px-4">Capacidade Limite</th>
                  <th className="py-3 px-4 text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebe8df]">
                {filteredRooms.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#7f7667] text-xs font-sans">
                      Nenhuma sala encontrada com os filtros atuais.
                    </td>
                  </tr>
                )}
                {filteredRooms.map((room) => (
                  <tr key={room.id} className="hover:bg-[#fcf9f0] transition-colors">
                    <td className="py-3 px-4 font-mono text-[10px] text-[#7f7667]">
                      {roomSearch && room.id.toLowerCase().includes(roomSearch.toLowerCase()) 
                        ? <span className="bg-yellow-200">{room.id}</span> 
                        : room.id}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#1c1c17]">
                      {roomSearch && room.name.toLowerCase().includes(roomSearch.toLowerCase()) 
                        ? <span className="bg-yellow-200">{room.name}</span> 
                        : room.name}
                    </td>
                    <td className="py-3 px-4 text-[#4e4639]">{room.category}</td>
                    <td className="py-3 px-4">
                      {room.status === "locked" ? (
                        <span className="flex items-center gap-1 text-[#5d4201] font-bold text-[10px] bg-[#ffdea5] px-2 py-0.5 rounded w-max">
                          <Lock className="w-3 h-3" /> Privada (Com Senha)
                        </span>
                      ) : room.status === "read-only" ? (
                        <span className="flex items-center gap-1 text-[#4e4639] font-bold text-[10px] bg-[#ebe8df] px-2 py-0.5 rounded w-max">
                          <Eye className="w-3 h-3" /> Apenas Leitura
                        </span>
                      ) : (
                        <span className="text-[#3f6d38] font-bold text-[10px] bg-[#b9eeab] px-2 py-0.5 rounded w-max block">
                          🟢 Aberta Livre
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {room.visibility === "hidden" ? (
                        <span className="flex items-center gap-1 text-red-800 font-bold text-[10px] bg-red-50 px-2 py-0.5 rounded w-max">
                          <EyeOff className="w-3 h-3" /> Oculta (Link)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-800 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded w-max">
                          <Eye className="w-3 h-3" /> Pública
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-xs">
                      {room.password ? `🔑 ${room.password}` : "—"}
                    </td>
                    <td className="py-3 px-4 font-bold">{room.current_users} / {room.max_users}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {/* Apenas Owner e Admin podem alterar configurações e visibilidade */}
                      {(role === "owner" || role === "admin") ? (
                        <div className="flex flex-col gap-1.5 justify-end w-max ml-auto">
                          <button onClick={() => setShareLinkRoom(room)} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" title="Gerar Link">
                            <LinkIcon className="w-3.5 h-3.5" /> Gerar link
                          </button>
                          <button onClick={() => { setRenameRoom(room); setRenameInput(room.name); }} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" title="Renomear Sala">
                            <Edit2 className="w-3.5 h-3.5" /> Editar nome
                          </button>
                          <button onClick={() => handleToggleVisibility(room)} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" title="Ocultar / Tornar Pública">
                            {room.visibility === 'public' ? <><EyeOff className="w-3.5 h-3.5" /> Ocultar</> : <><Eye className="w-3.5 h-3.5" /> Tornar pública</>}
                          </button>
                          <button onClick={() => handleToggleMute(room)} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" title="Silenciar / Liberar Chat">
                            {room.status === 'read-only' ? <><Volume2 className="w-3.5 h-3.5" /> Liberar chat</> : <><VolumeX className="w-3.5 h-3.5" /> Silenciar</>}
                          </button>
                          <button onClick={() => handleToggleLockQuick(room)} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" title="Trancar / Destrancar">
                            {room.status === 'locked' ? <><Unlock className="w-3.5 h-3.5" /> Destrancar</> : <><Lock className="w-3.5 h-3.5" /> Trancar</>}
                          </button>
                          <button 
                            onClick={() => {
                              setEditingRoom(room);
                              setRoomName(room.name);
                              setRoomStatus(room.status);
                              setRoomVisibility(room.visibility);
                              setRoomPassword(room.password || "");
                              setRoomMaxUsers(room.max_users);
                              setRoomPinnedMessage(room.pinnedMessage || "");
                              setRoomCtaLink(room.ctaLink || "");
                              setRoomCtaText(room.ctaText || "");
                            }} 
                            className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ebe8df] hover:bg-blue-700 hover:text-white rounded font-bold text-[10px] text-[#4e4639] transition-colors" 
                            title="Editar Configurações"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button onClick={() => handleDeleteRoom(room)} className="flex items-center gap-1.5 px-2 py-1.5 bg-[#ffdad6] hover:bg-red-700 hover:text-white rounded font-bold text-[10px] text-red-900 transition-colors" title="Deletar Sala">
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Sem permissão</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA DE LOGS DE AUDITORIA ADMINISTRATIVA */}
      {!loading && activeTab === "auditLogs" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm overflow-hidden animate-fade-in" id="admin_audit_logs_view">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#f6f3ea] border-b border-[#ebe8df] text-[#4e4639] font-bold">
                <tr>
                  <th className="py-3 px-4">Horário</th>
                  <th className="py-3 px-4">Ação executada</th>
                  <th className="py-3 px-4">Operador</th>
                  <th className="py-3 px-4">Alvo ID</th>
                  <th className="py-3 px-4">Detalhes do Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebe8df]">
                {auditLogsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#7f7667] text-xs font-sans">
                      Nenhum registro de auditoria disponível.
                    </td>
                  </tr>
                ) : (
                  auditLogsList.map((log) => (
                    <tr key={log.id} className="hover:bg-[#fcf9f0] transition-colors">
                      <td className="py-3 px-4 text-[#7f7667] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-[#ebe8df] rounded font-bold text-[10px] text-[#4e4639]">
                          {translateAuditAction(log.action)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-amber-800">{log.operator}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-[#7f7667]">{log.targetId.slice(0, 15)}...</td>
                      <td className="py-3 px-4 text-[#1c1c17] font-medium">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA DE CONFIGURAÇÕES EXTERNAS */}
      {!loading && activeTab === "config" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm p-6 animate-fade-in" id="admin_config_view">
          <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Links Externos de Navegação</h3>
          <p className="font-sans text-xs text-[#7f7667] mb-6">
            Configure as URLs dos botões no topo da interface do chat. Deixe em branco se desejar ocultar o botão.
          </p>

          <form onSubmit={saveExternalLinks} className="space-y-4 max-w-lg">
            <div>
              <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">EGE Games URL</label>
              <input
                type="url"
                value={externalLinks.egeGames}
                onChange={(e) => setExternalLinks({ ...externalLinks, egeGames: e.target.value })}
                className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                placeholder="https://"
              />
            </div>
            <div>
              <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">Escola EGE URL</label>
              <input
                type="url"
                value={externalLinks.escolaEGE}
                onChange={(e) => setExternalLinks({ ...externalLinks, escolaEGE: e.target.value })}
                className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                placeholder="https://"
              />
            </div>
            <div>
              <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">Sala dos Professores URL</label>
              <input
                type="url"
                value={externalLinks.salaProfessores}
                onChange={(e) => setExternalLinks({ ...externalLinks, salaProfessores: e.target.value })}
                className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                placeholder="https://"
              />
            </div>

            <div className="border-t border-[#ebe8df] pt-4 my-2">
              <span className="text-[10px] font-bold uppercase text-[#7f7667] tracking-wider block mb-3">Links do Rodapé</span>
              
              <div className="space-y-4">
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">Diretrizes da Comunidade URL</label>
                  <input
                    type="url"
                    value={externalLinks.diretrizesComunidade || ""}
                    onChange={(e) => setExternalLinks({ ...externalLinks, diretrizesComunidade: e.target.value })}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">Privacidade URL</label>
                  <input
                    type="url"
                    value={externalLinks.privacidade || ""}
                    onChange={(e) => setExternalLinks({ ...externalLinks, privacidade: e.target.value })}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">Manual de Moderação URL</label>
                  <input
                    type="url"
                    value={externalLinks.manualModeracao || ""}
                    onChange={(e) => setExternalLinks({ ...externalLinks, manualModeracao: e.target.value })}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                    placeholder="https://"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm transition-all"
              >
                Salvar Links Externos
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ABA DE PALAVRAS PROIBIDAS */}
      {!loading && activeTab === "prohibitedWords" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm p-6 animate-fade-in flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Palavras Proibidas</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-6">
              Mensagens contendo essas palavras serão analisadas. O nível "Block" bloqueia o envio da mensagem. O nível "Warn" permite o envio mas marca a mensagem internamente para moderação.
            </p>

            <form onSubmit={handleAddProhibitedWord} className="space-y-4 max-w-sm mb-8 bg-[#fcf9f0] p-4 rounded-xl border border-[#ebe8df]">
              <div>
                <label className="font-sans text-[10px] font-bold uppercase text-[#4e4639] block mb-1">Adicionar Nova Palavra</label>
                <input
                  type="text"
                  value={newProhibitedWord}
                  onChange={(e) => setNewProhibitedWord(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: palavraofensiva"
                  required
                  minLength={2}
                />
              </div>
              <div>
                <label className="font-sans text-[10px] font-bold uppercase text-[#4e4639] block mb-1">Severidade da Punição</label>
                <select 
                  value={newProhibitedSeverity}
                  onChange={(e) => setNewProhibitedSeverity(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="block">BLOCK - Bloquear Envio</option>
                  <option value="warn">WARN - Apenas Alertar/Marcar</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm transition-all"
              >
                Adicionar ao Filtro
              </button>
            </form>
          </div>

          <div className="flex-1 bg-[#fcf9f0] border border-[#ebe8df] rounded-xl overflow-hidden max-h-[500px] flex flex-col">
            <div className="p-3 border-b border-[#ebe8df] bg-[#ebe8df]/50 font-bold text-xs text-[#4e4639]">
              Palavras Registradas ({prohibitedWords.length})
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {prohibitedWords.length === 0 ? (
                <p className="text-center text-xs text-[#7f7667] py-8">Nenhuma palavra cadastrada.</p>
              ) : (
                prohibitedWords.map((pw, i) => (
                  <div key={i} className="flex justify-between items-center bg-white border border-[#ebe8df] p-2 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1c1c17]">{pw.word}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${pw.severity === 'block' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {pw.severity}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleRemoveProhibitedWord(pw.word)}
                      className="p-1.5 text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA DE GERENCIAMENTO DINÂMICO DE STAFF (EXCLUSIVO DO PROPRIETÁRIO) */}
      {!loading && activeTab === ("staff" as any) && role === "owner" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm p-6 animate-fade-in flex flex-col md:flex-row gap-6" id="admin_staff_view">
          <div className="flex-1">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Gerenciar Equipe Acadêmica</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-6">
              Cadastre logins e senhas exclusivos para cada Moderador e Administrador. Por segurança, os colaboradores não compartilharão a mesma senha master e o acesso deles pode ser revogado a qualquer momento.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-4 max-w-sm mb-8 bg-[#fcf9f0] p-4 rounded-xl border border-[#ebe8df]">
              <div>
                <label className="font-sans text-[10px] font-bold uppercase text-[#4e4639] block mb-1">Nome de Usuário (Login)</label>
                <input
                  type="text"
                  value={newStaffUser}
                  onChange={(e) => setNewStaffUser(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: prof_silva"
                  required
                  minLength={3}
                  maxLength={20}
                />
              </div>
              <div>
                <label className="font-sans text-[10px] font-bold uppercase text-[#4e4639] block mb-1">Senha do Colaborador</label>
                <input
                  type="password"
                  value={newStaffPass}
                  onChange={(e) => setNewStaffPass(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Digite uma senha forte"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="font-sans text-[10px] font-bold uppercase text-[#4e4639] block mb-1">Nível de Acesso (Cargo)</label>
                <select 
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="moderator">Moderador (Fila de Moderação + Ações de Chat)</option>
                  <option value="admin">Administrador (Gestão de Salas + Configurações de Links)</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm transition-all"
              >
                Cadastrar Colaborador
              </button>
            </form>
          </div>

          <div className="flex-1 bg-[#fcf9f0] border border-[#ebe8df] rounded-xl overflow-hidden max-h-[500px] flex flex-col">
            <div className="p-3 border-b border-[#ebe8df] bg-[#ebe8df]/50 font-bold text-xs text-[#4e4639]">
              Colaboradores Ativos ({staffList.length})
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {staffList.length === 0 ? (
                <p className="text-center text-xs text-[#7f7667] py-8">Nenhum moderador ou administrador cadastrado.</p>
              ) : (
                staffList.map((staff, i) => (
                  <div key={i} className="flex justify-between items-center bg-white border border-[#ebe8df] p-3 rounded shadow-2xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#1c1c17]">{staff.username}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${staff.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {translateRole(staff.role)}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#7f7667] font-sans mt-0.5">Criado em: {new Date(staff.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteStaff(staff.username)}
                      className="p-1.5 text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                      title="Excluir Colaborador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA DE MÉTRICAS DE ACESSO */}
      {!loading && activeTab === "roomAccess" && (
        <div className="bg-white border border-[#ebe8df] rounded-2xl shadow-sm p-6 animate-fade-in flex flex-col gap-6" id="admin_room_access_view">
          {/* SECÃO TOP SALAS */}
          <div className="bg-[#fcf9f0] border border-[#ebe8df] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#775a19]" /> 🔥 Ranking: Top Salas Hoje
                </h3>
                <p className="font-sans text-xs text-[#7f7667]">As salas com maior número de visitantes únicos no dia atual.</p>
              </div>
              <button
                onClick={fetchTopRooms}
                className="p-2 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white text-[#4e4639] rounded-lg transition-colors flex items-center gap-2"
                title="Atualizar Ranking"
              >
                <RefreshCw className={`w-4 h-4 ${loadingTopRooms ? 'animate-spin' : ''}`} />
                <span className="text-xs font-bold hidden md:inline">Atualizar</span>
              </button>
            </div>

            {loadingTopRooms ? (
              <div className="text-center py-8 text-[#7f7667] text-sm animate-pulse font-sans">Calculando ranking em tempo real...</div>
            ) : topRooms.length === 0 ? (
              <div className="text-center py-8 text-[#7f7667] text-sm font-sans">Nenhum acesso registrado hoje.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {topRooms.map((room, index) => (
                  <div key={room.roomId} className="bg-white border border-[#ebe8df] p-3 rounded-lg flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold font-serif text-sm ${
                        index === 0 ? 'bg-amber-400 text-amber-900 shadow-md' :
                        index === 1 ? 'bg-slate-300 text-slate-800 shadow-sm' :
                        index === 2 ? 'bg-orange-300 text-orange-900 shadow-sm' :
                        'bg-[#ebe8df] text-[#4e4639]'
                      }`}>
                        #{index + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-bold text-[#1c1c17] text-xs truncate max-w-[120px] md:max-w-[150px]" title={room.roomName}>{room.roomName}</span>
                        <span className="text-[10px] text-[#7f7667] font-mono">{room.roomId.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-bold font-serif text-[#775a19] text-base">{room.count}</span>
                      <span className="text-[9px] uppercase font-bold text-[#7f7667]">Visitas</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-[#ebe8df]" />

          {/* SECÃO MÉTRICAS POR SALA */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Métricas Detalhadas por Sala</h3>
              <p className="font-sans text-xs text-[#7f7667]">Selecione uma sala para visualizar o histórico de acessos únicos (visitantes).</p>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={selectedRoomForMetrics}
                onChange={(e) => {
                  setSelectedRoomForMetrics(e.target.value);
                  fetchRoomMetrics(e.target.value);
                }}
                className="px-3 py-2 bg-[#fcf9f0] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19] min-w-[200px]"
              >
                <option value="" disabled>Selecione uma sala...</option>
                {roomsList.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
              
              {selectedRoomForMetrics && (
                <button
                  onClick={() => fetchRoomMetrics(selectedRoomForMetrics)}
                  className="p-2 bg-[#ebe8df] hover:bg-[#775a19] hover:text-white text-[#4e4639] rounded-lg transition-colors"
                  title="Atualizar Métricas"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingMetrics ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {selectedRoomForMetrics && !loadingMetrics && roomAccessMetrics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#fcf9f0] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7f7667]">Acessos Hoje</span>
                    <span className="p-1.5 bg-[#b9eeab] rounded-lg text-[#3f6d38] font-bold text-[10px]"><Users className="w-3 h-3" /></span>
                  </div>
                  <p className="font-serif font-bold text-3xl text-[#1c1c17]">
                    {roomAccessMetrics.today}
                  </p>
                </div>
                <div className="bg-[#fcf9f0] border border-[#ebe8df] p-6 rounded-2xl flex flex-col justify-between shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7f7667]">Últimos 7 Dias</span>
                    <span className="p-1.5 bg-[#b9eeab] rounded-lg text-[#3f6d38] font-bold text-[10px]"><BarChart2 className="w-3 h-3" /></span>
                  </div>
                  <p className="font-serif font-bold text-3xl text-[#1c1c17]">
                    {roomAccessMetrics.last7days}
                  </p>
                </div>
              </div>

              <div className="border border-[#ebe8df] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-[#f6f3ea] border-b border-[#ebe8df] text-[#4e4639] font-bold">
                    <tr>
                      <th className="py-3 px-4">Data (YYYY-MM-DD)</th>
                      <th className="py-3 px-4 text-right">Acessos Únicos Confirmados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ebe8df]">
                    {roomAccessMetrics.daily.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-[#7f7667] text-xs font-sans bg-white">
                          Nenhum acesso registrado nos últimos dias.
                        </td>
                      </tr>
                    ) : (
                      roomAccessMetrics.daily.map((item: any, i: number) => (
                        <tr key={i} className="bg-white hover:bg-[#fcf9f0] transition-colors">
                          <td className="py-3 px-4 text-[#1c1c17] font-bold">{item.date}</td>
                          <td className="py-3 px-4 text-right font-serif font-bold text-[#775a19]">{item.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : selectedRoomForMetrics && loadingMetrics ? (
            <div className="text-center py-12 text-[#7f7667] text-sm animate-pulse font-sans">Carregando métricas...</div>
          ) : (
            <div className="text-center py-12 text-[#7f7667] text-sm font-sans bg-[#fcf9f0] rounded-xl border border-dashed border-[#d1c5b4]">
              Por favor, selecione uma sala no menu acima para visualizar os dados de acesso.
            </div>
          )}
        </div>
      )}

      {/* MODAL DO CONFIGURADOR DE SALAS */}
      {isCreatingRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="room_creator_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Criar Nova Sala</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-6">
              Defina as propriedades para a nova sala. Limite de 50 salas principais.
            </p>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Nome da Sala Acadêmica
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Nome (Ex: Matemática 101)"
                  required
                />
              </div>

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Categoria Acadêmica
                </label>
                <input
                  type="text"
                  value={roomCategory}
                  onChange={(e) => setRoomCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: Geral, Artes..."
                  required
                />
              </div>

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Status de Privacidade
                </label>
                <select
                  value={roomStatus}
                  onChange={(e) => setRoomStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="open">🟢 Aberta Livre (Sem senha)</option>
                  <option value="locked">🔒 Privada (Com chave de senha)</option>
                  <option value="read-only">👁️ Apenas Leitura (Sem escrita)</option>
                </select>
              </div>

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Visibilidade da Sala
                </label>
                <select
                  value={roomVisibility}
                  onChange={(e) => setRoomVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="public">👁️ Pública (Visível na lista inicial)</option>
                  <option value="hidden">🕶️ Oculta (Acessível apenas via Link Direto)</option>
                </select>
              </div>

              {roomStatus === "locked" && (
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                    Senha de Acesso Acadêmico
                  </label>
                  <input
                    type="text"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                    required
                  />
                </div>
              )}

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Limite Máximo de Acadêmicos Concurrentes
                </label>
                <input
                  type="number"
                  value={roomMaxUsers}
                  onChange={(e) => setRoomMaxUsers(Number(e.target.value))}
                  min={5}
                  max={500}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 border-t border-[#ebe8df]">
                <h4 className="font-bold text-[#1c1c17] text-xs uppercase mb-2">Monetização e Engajamento</h4>
                
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">Mensagem Fixa (Topo da Sala)</label>
                <input
                  type="text"
                  value={roomPinnedMessage}
                  onChange={(e) => setRoomPinnedMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: Sejam bem-vindos! Confira o material de apoio."
                />

                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">Texto do Botão CTA (Call to Action)</label>
                <input
                  type="text"
                  value={roomCtaText}
                  onChange={(e) => setRoomCtaText(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: Ver Curso Completo"
                />

                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">URL do Destino (CTA Link)</label>
                <input
                  type="url"
                  value={roomCtaLink}
                  onChange={(e) => setRoomCtaLink(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: https://escola-ege.com/curso"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreatingRoom(false)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm"
                >
                  Criar Sala
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="room_editor_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Configurar {editingRoom.name}</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-6">
              Ajuste as propriedades de privacidade, visibilidade e tráfego da sala.
            </p>

            <form onSubmit={handleRoomEditorSubmit} className="space-y-4">
              {/* Campo para editar o nome da sala (Exclusivo do Dono/Owner e Admin) */}
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Nome da Sala Acadêmica
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                />
              </div>

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Status de Privacidade
                </label>
                <select
                  value={roomStatus}
                  onChange={(e) => setRoomStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="open">🟢 Aberta Livre (Sem senha)</option>
                  <option value="locked">🔒 Privada (Com chave de senha)</option>
                  <option value="read-only">👁️ Apenas Leitura (Sem escrita)</option>
                </select>
              </div>

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Visibilidade da Sala
                </label>
                <select
                  value={roomVisibility}
                  onChange={(e) => setRoomVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                >
                  <option value="public">👁️ Pública (Visível na lista inicial)</option>
                  <option value="hidden">🕶️ Oculta (Acessível apenas via Link Direto)</option>
                </select>
              </div>

              {roomStatus === "locked" && (
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                    Senha de Acesso Acadêmico
                  </label>
                  <input
                    type="text"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                    required
                  />
                  <p className="text-[10px] text-[#7f7667] font-sans mt-0.5">Defina chaves numéricas ou em texto.</p>
                </div>
              )}

              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Limite Máximo de Acadêmicos Concurrentes
                </label>
                <input
                  type="number"
                  value={roomMaxUsers}
                  onChange={(e) => setRoomMaxUsers(Number(e.target.value))}
                  min={5}
                  max={500}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none"
                  required
                />
                <p className="text-[10px] text-[#7f7667] font-sans mt-0.5">Se o limite for excedido, o sistema criará instâncias de estouro.</p>
              </div>

              <div className="pt-2 border-t border-[#ebe8df]">
                <h4 className="font-bold text-[#1c1c17] text-xs uppercase mb-2">Monetização e Engajamento</h4>
                
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">Mensagem Fixa (Topo da Sala)</label>
                <input
                  type="text"
                  value={roomPinnedMessage}
                  onChange={(e) => setRoomPinnedMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: Sejam bem-vindos! Confira o material de apoio."
                />

                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">Texto do Botão CTA (Call to Action)</label>
                <input
                  type="text"
                  value={roomCtaText}
                  onChange={(e) => setRoomCtaText(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: Ver Curso Completo"
                />

                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1 mt-2">URL do Destino (CTA Link)</label>
                <input
                  type="url"
                  value={roomCtaLink}
                  onChange={(e) => setRoomCtaLink(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  placeholder="Ex: https://escola-ege.com/curso"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm"
                >
                  Salvar Configuração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE LINK DE COMPARTILHAMENTO */}
      {shareLinkRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="share_link_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Convite para Sala</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-4">
              Compartilhe o link abaixo para convidar estudantes para a sala <strong>{shareLinkRoom.name}</strong>.
            </p>
            <div className="bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg p-3 flex flex-col gap-3">
              <input 
                type="text" 
                readOnly 
                value={`${window.location.origin}/chat?room=${encodeURIComponent(shareLinkRoom.name)}`}
                className="w-full bg-transparent text-xs font-mono text-[#4e4639] focus:outline-none overflow-hidden" 
              />
              <button 
                onClick={copyShareLink}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#775a19] text-white hover:brightness-105 rounded-lg text-xs font-bold font-sans cursor-pointer shadow-sm transition-all"
              >
                <Copy className="w-4 h-4" /> Copiar link
              </button>
            </div>
            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShareLinkRoom(null)}
                className="w-full py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SENHA RÁPIDA (QUICK LOCK) */}
      {quickLockRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="quick_lock_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Trancar Sala</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-4">
              Defina a senha de acesso para restringir a sala <strong>{quickLockRoom.name}</strong>.
            </p>
            <form onSubmit={submitQuickLock} className="space-y-4">
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Nova Senha de Acesso
                </label>
                <input
                  type="text"
                  value={quickLockPassword}
                  onChange={(e) => setQuickLockPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setQuickLockRoom(null); setQuickLockPassword(""); }}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm"
                >
                  Confirmar e Trancar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE RENAME ROOM */}
      {renameRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="rename_room_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Editar Nome da Sala</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-4">
              Defina o novo título para a sala.
            </p>
            <form onSubmit={submitRename} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameRoom(null)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans cursor-pointer shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO GENÉRICA (UX SAFETY) */}
      {confirmModal && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="confirm_action_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-2">{confirmModal.title}</h3>
            <p className="font-sans text-sm text-[#4e4639] font-medium leading-relaxed mb-6">
              {confirmModal.message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold font-sans cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleGenericAction(confirmModal.endpoint, confirmModal.body, "Ação confirmada e executada com sucesso!")}
                className="flex-1 py-2.5 rounded-lg bg-[#b9eeab] text-[#3f6d38] border border-[#3f6d38]/20 hover:brightness-95 text-xs font-bold font-sans cursor-pointer shadow-sm"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
