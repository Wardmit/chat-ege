import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { User, Room, Message } from "./types";
import RoomList from "./components/RoomList";
import ChatWindow from "./components/ChatWindow";
import AdminPanel from "./components/AdminPanel";
import {
  Compass, Shield, UserCog, Edit2, LogIn, ExternalLink, HelpCircle,
  GraduationCap, BookOpen, MessageSquare, Sparkles, Check, KeyRound
} from "lucide-react";
import { apiFetch } from "./api";
import { getSocketUrl } from "./config/env";

// Recupera ou cria UUID no localStorage e configura nos cookies
function getOrCreateUserUuid(): string {
  let uuid = localStorage.getItem("x_user_uuid");
  if (!uuid) {
    uuid = uuidv4();
    localStorage.setItem("x_user_uuid", uuid);
  }
  document.cookie = `x_user_uuid=${uuid}; path=/; max-age=31536000; SameSite=Lax`;
  return uuid;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<"rooms" | "chat" | "admin-login" | "admin">("rooms");
  
  // Estados de Apelido
  const [usernameInput, setUsernameInput] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [renameSuccess, setRenameSuccess] = useState(false);

  // Estados de Admin e Autenticação
  const [adminToken, setAdminToken] = useState<string | null>(localStorage.getItem("ege_admin_token"));
  const [adminRole, setAdminRole] = useState<"owner" | "admin" | "moderator">((localStorage.getItem("ege_admin_role") as any) || "moderator");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");

  // Alertas do Sistema
  const [alertMessage, setAlertMessage] = useState("");
  const [externalLinks, setExternalLinks] = useState<{egeGames?: string, escolaEGE?: string, salaProfessores?: string} | null>(null);

  // Estados de Link Direto e Sala Trancada
  const [directLockedRoom, setDirectLockedRoom] = useState<Room | null>(null);
  const [directPasswordInput, setDirectPasswordInput] = useState("");
  const [directPasswordError, setDirectPasswordError] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const userUuidRef = useRef<string>(getOrCreateUserUuid());
  const initialRedirectDone = useRef<boolean>(false);

  // Estabelece conexão única e resiliente WebSocket na inicialização
  useEffect(() => {
    // Captura e autolimpeza da URL secreta /paineladmin para maior segurança do portal
    const path = window.location.pathname.toLowerCase().replace(/\/$/, "");
    if (path === "/paineladmin" || path.endsWith("/paineladmin")) {
      setView("admin-login");
      window.history.replaceState({}, "", "/");
    }

    fetchUserProfile();
    fetchRoomsAndHandleDirectLink();
    apiFetch("/api/external-links").then(res => res.json()).then(setExternalLinks).catch(console.error);

    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Conectado ao servidor de Socket.IO. Sincronizando sessão...");
      socket.emit("authenticate_socket", { userId: userUuidRef.current });
      
      // Reentrar automaticamente na última sala ativa se disponível
      const savedRoomId = sessionStorage.getItem("ege_active_room_id");
      if (savedRoomId) {
        socket.emit("join_room", { roomId: savedRoomId, userId: userUuidRef.current });
      }
    });

    // Sincronizar o estado e cargo do perfil do usuário após autenticação do socket
    socket.on("auth_sync", (syncedUser: User) => {
      setCurrentUser(syncedUser);
      setUsernameInput(syncedUser.username);
    });

    // Mudança de cargo reativa em tempo real
    socket.on("user_role_updated", ({ userId, role }) => {
      setCurrentUser((prev) => {
        if (prev && prev.id === userId) {
          return { ...prev, role };
        }
        return prev;
      });
      // Sincronizar painel caso o admin mude o cargo do usuário logado no admin
      if (userUuidRef.current === userId && role === "user") {
        setAdminToken(null);
        localStorage.removeItem("ege_admin_token");
        localStorage.removeItem("ege_admin_role");
        setView("rooms");
      }
    });

    socket.on("receive_message", (message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    socket.on("message_history", (history: Message[]) => {
      setMessages(history);
    });

    socket.on("message_updated", (updatedMessage: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
      );
    });

    socket.on("message_deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    socket.on("room_user_count", ({ roomId, count }) => {
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, current_users: count } : r))
      );
      setActiveRoom((prev) =>
        prev && prev.id === roomId ? { ...prev, current_users: count } : prev
      );
    });

    socket.on("user_muted_updated", ({ userId, status }) => {
      setCurrentUser((prev) => {
        if (prev && prev.id === userId) {
          return { ...prev, status };
        }
        return prev;
      });
    });

    socket.on("user_banned", ({ userId }) => {
      if (userUuidRef.current === userId) {
        setAlertMessage("Você foi banido permanentemente desta comunidade por infração das diretrizes acadêmicas.");
        setCurrentUser((prev) => prev ? { ...prev, status: "banned" } : null);
        setView("rooms");
        setActiveRoom(null);
        sessionStorage.removeItem("ege_active_room_id");
      }
    });

    socket.on("room_updated", (updatedRoom: Room) => {
      // Atualizar lista de salas
      setRooms((prev) =>
        prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r))
      );
      // Atualizar a sala ativa se for a modificada
      setActiveRoom((prev) => {
        if (prev && prev.id === updatedRoom.id) {
          return { ...prev, ...updatedRoom };
        }
        return prev;
      });
    });

    socket.on("external_links_updated", (links) => {
      setExternalLinks(links);
    });

    socket.on("error_alert", ({ message }) => {
      setAlertMessage(message);
      setTimeout(() => setAlertMessage(""), 6000);
    });

    socket.on("warning_alert", ({ message }) => {
      setAlertMessage(`[AVISO] ${message}`); // Or create a separate warning state, but reusing alert is fine
      setTimeout(() => setAlertMessage(""), 6000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchUserProfile = async () => {
    try {
      const res = await apiFetch("/api/user/me", {
        headers: { "x-user-id": userUuidRef.current }
      });
      if (res.ok) {
        const profile = await res.json();
        setCurrentUser(profile);
        setUsernameInput(profile.username);
      }
    } catch (e) {
      console.error("Não foi possível buscar o perfil de usuário:", e);
    }
  };

  const fetchRoomsAndHandleDirectLink = async () => {
    try {
      const res = await apiFetch("/api/rooms");
      if (res.ok) {
        const list = await res.json();
        setRooms(list);
        
        // Tratar link direto apenas uma vez na inicialização
        if (!initialRedirectDone.current) {
          initialRedirectDone.current = true;
          const params = new URLSearchParams(window.location.search);
          const roomParam = params.get("room");
          if (roomParam) {
            handleDirectLinkAccess(roomParam, list);
          }
        }
      }
    } catch (e) {
      console.error("Erro ao listar salas:", e);
    }
  };

  // Tratar acesso de link direto a salas (inclusive salas ocultas)
  const handleDirectLinkAccess = (roomNameOrId: string, roomsList: Room[]) => {
    const cleanParam = roomNameOrId.toLowerCase().trim();
    
    // Buscar sala por ID ou por Nome correspondente
    const targetRoom = roomsList.find(
      r => r.id.toLowerCase() === cleanParam || r.name.toLowerCase().trim() === cleanParam
    );

    if (!targetRoom) {
      setAlertMessage(`A sala de estudos "${roomNameOrId}" informada via link direto não foi encontrada.`);
      setTimeout(() => setAlertMessage(""), 5000);
      return;
    }

    if (targetRoom.status === "locked") {
      // Exibe modal de senha exclusivo para acesso por link direto
      setDirectLockedRoom(targetRoom);
      setDirectPasswordInput("");
      setDirectPasswordError("");
    } else {
      // Entrar diretamente na sala pública ou leitura
      handleJoinRoom(targetRoom.id);
    }
  };

  const handleDirectUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directLockedRoom) return;

    if (!directPasswordInput.trim()) {
      setDirectPasswordError("A senha não pode estar em branco.");
      return;
    }

    // Validar senha contra a configurada na sala
    if (directPasswordInput === "123456" || directPasswordInput === directLockedRoom.password) {
      handleJoinRoom(directLockedRoom.id, directPasswordInput);
      setDirectLockedRoom(null);
    } else {
      setDirectPasswordError("Senha acadêmica incorreta! Dica: Use a senha padrão '123456'.");
    }
  };

  // Entrar em Sala (API + WebSocket)
  const handleJoinRoom = async (roomId: string, password?: string) => {
    try {
      const res = await apiFetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userUuidRef.current
        },
        body: JSON.stringify({ roomId, password })
      });

      const data = await res.json();
      if (!res.ok) {
        setAlertMessage(data.error || "Falha ao entrar na sala de bate-papo.");
        setTimeout(() => setAlertMessage(""), 5000);
        return;
      }

      const targetRoom = data as Room;
      setActiveRoom(targetRoom);
      setView("chat");
      sessionStorage.setItem("ege_active_room_id", targetRoom.id);

      // Enviar entrada via socket
      if (socketRef.current) {
        socketRef.current.emit("join_room", { roomId: targetRoom.id, userId: userUuidRef.current });
      }
    } catch (err) {
      setAlertMessage("Erro ao conectar com o servidor.");
    }
  };

  const handleLeaveRoom = () => {
    if (activeRoom && socketRef.current) {
      socketRef.current.emit("leave_room", { roomId: activeRoom.id });
    }
    setActiveRoom(null);
    setView("rooms");
    setMessages([]);
    sessionStorage.removeItem("ege_active_room_id");
    fetchRoomsAndHandleDirectLink(); // Sincronizar capacidades
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const token = adminToken || localStorage.getItem("ege_admin_token");
      const res = await apiFetch("/api/admin/message/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ messageId })
      });
      
      const data = await res.json();
      if (!res.ok) {
        setAlertMessage(data.error || "Erro ao deletar a mensagem.");
        setTimeout(() => setAlertMessage(""), 5000);
      }
    } catch (e) {
      setAlertMessage("Erro ao se conectar com o servidor.");
      setTimeout(() => setAlertMessage(""), 5000);
    }
  };

  const handleSendMessage = (content: string, replyToMessageId?: string) => {
    if (!activeRoom || !currentUser || !socketRef.current) return;
    socketRef.current.emit("send_message", {
      roomId: activeRoom.id,
      userId: currentUser.id,
      content,
      replyToMessageId
    });
  };

  const handleLikeMessage = (messageId: string) => {
    if (!currentUser || !socketRef.current) return;
    socketRef.current.emit("like_message", { messageId, userId: currentUser.id });
  };

  const handleDislikeMessage = (messageId: string) => {
    if (!currentUser || !socketRef.current) return;
    socketRef.current.emit("dislike_message", { messageId, userId: currentUser.id });
  };

  const handleReportMessage = (messageId: string) => {
    if (!currentUser || !socketRef.current) return;
    const confirmReport = window.confirm("Deseja denunciar esta mensagem acadêmica por conduta imprópria? Mensagens com 5 ou mais denúncias de abuso são filtradas do chat automaticamente.");
    if (!confirmReport) return;
    
    socketRef.current.emit("report_message", { messageId, userId: currentUser.id });
  };

  // Renomear apelido anônimo
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRenameError("");
    setRenameSuccess(false);

    if (!usernameInput.trim()) {
      setRenameError("Nome de usuário inválido.");
      return;
    }

    try {
      const res = await apiFetch("/api/user/update-name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userUuidRef.current
        },
        body: JSON.stringify({ newName: usernameInput })
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data);
        setRenameSuccess(true);
        setTimeout(() => {
          setShowRenameModal(false);
          setRenameSuccess(false);
        }, 1500);
      } else {
        setRenameError(data.error || "Erro ao renomear usuário.");
      }
    } catch (err) {
      setRenameError("Falha na conexão com o servidor.");
    }
  };

  // Autenticação Admin
  const handleAdminSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");

    try {
      const res = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUser, password: adminPass })
      });

      const data = await res.json();
      if (res.ok) {
        setAdminToken(data.token);
        setAdminRole(data.role);
        localStorage.setItem("ege_admin_token", data.token);
        localStorage.setItem("ege_admin_role", data.role);
        setView("admin");
      } else {
        setAdminError(data.error || "Senha administrativa incorreta!");
      }
    } catch (err) {
      setAdminError("Erro ao comunicar com a autenticação.");
    }
  };

  const handleAdminLogout = () => {
    setAdminToken(null);
    localStorage.removeItem("ege_admin_token");
    localStorage.removeItem("ege_admin_role");
    setView("rooms");
  };

  const navigateToAdminPortal = () => {
    if (adminToken) {
      setView("admin");
    } else {
      setView("admin-login");
    }
  };

  return (
    <div className="min-h-screen bg-[#fcf9f0] text-[#1c1c17] font-sans flex flex-col justify-between" id="app_view_root">
      
      {/* Cabeçalho Elegante */}
      <header className="bg-white border-b border-[#ebe8df] shadow-[0px_2px_4px_rgba(0,0,0,0.015)] shrink-0 py-4 px-4 md:px-8 select-none">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#775a19] flex items-center justify-center shadow-md">
              <GraduationCap className="w-6 h-6 text-[#fcf9f0]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-lg md:text-xl text-[#775a19]">
                  EGE Chat Rooms
                </span>
                <span className="text-[10px] bg-[#3b6934] text-white px-2 py-0.5 rounded font-sans font-bold uppercase tracking-wider">
                  Estudos Acadêmicos
                </span>
              </div>
              <p className="font-sans text-[11px] text-[#7f7667] font-medium leading-none mt-0.5">
                Salas de discussão reativa inteligente para formação acadêmica.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentUser && (
              <div className="flex items-center gap-2 bg-[#f6f3ea] px-3.5 py-1.5 rounded-full border border-[#d1c5b4]/40">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span className="font-sans text-xs font-bold text-[#4e4639]">
                  {currentUser.username}
                </span>
                
                {currentUser.status === "muted" ? (
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold font-sans uppercase">
                    Silenciado
                  </span>
                ) : currentUser.status === "banned" ? (
                  <span className="text-[9px] bg-red-700 text-white px-1.5 py-0.5 rounded font-bold font-sans uppercase">
                    Banido
                  </span>
                ) : null}

                <button
                  onClick={() => {
                    setUsernameInput(currentUser.username);
                    setShowRenameModal(true);
                  }}
                  className="p-1 rounded text-[#7f7667] hover:text-[#775a19] cursor-pointer transition-colors"
                  title="Alterar apelido"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* O botão EGE Admin público foi ocultado por razões de segurança de acordo com a política de sigilo do portal */}

            {view === "admin" && (
              <button
                onClick={() => setView("rooms")}
                className="px-3.5 py-1.5 rounded-full bg-[#775a19] text-white hover:brightness-105 text-xs font-bold font-sans flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Voltar para as Salas</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Janela de Visualização Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-12 flex flex-col justify-start">
        
        {alertMessage && (
          <div className={`mb-4 border p-4 rounded-xl text-xs font-sans font-bold flex items-center gap-2 shadow-xs animate-fade-in ${
            alertMessage.startsWith("[AVISO]") 
              ? "bg-amber-100 border-amber-300 text-amber-950" 
              : "bg-red-100 border-red-300 text-red-950"
          }`}>
            <Shield className={`w-4 h-4 ${alertMessage.startsWith("[AVISO]") ? "text-amber-800" : "text-red-800"}`} />
            <span>{alertMessage.replace("[AVISO]", "").trim()}</span>
          </div>
        )}

        {view === "rooms" && (
          <div className="space-y-6">
            <div className="bg-[#fbf8f0] border border-[#ebe8df] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xs select-none">
              <div className="space-y-2 text-center md:text-left">
                <h2 className="font-serif font-black text-2xl md:text-3xl tracking-tight text-[#1c1c17] max-w-xl">
                  Participe ativamente dos círculos intelectuais de debate.
                </h2>
                <p className="font-sans text-sm text-[#4e4639] max-w-lg font-medium opacity-85 leading-relaxed">
                  Conecte-se de forma leve e segura a 50 salas exclusivas. Sem cadastro complexo, com moderação reativa de spam e distribuição automática de carga.
                </p>
              </div>

              <div className="flex gap-4 shrink-0 bg-[#ebe8df]/40 p-4 rounded-2xl border border-[#ebe8df]">
                <div className="text-center px-4">
                  <p className="font-serif font-bold text-xl text-[#775a19]">50</p>
                  <p className="font-sans text-[10px] text-[#7f7667] font-semibold">Salas de Estudo</p>
                </div>
                <div className="w-px bg-gray-300"></div>
                <div className="text-center px-4">
                  <p className="font-serif font-bold text-xl text-emerald-800">300</p>
                  <p className="font-sans text-[10px] text-[#7f7667] font-semibold">Limite / Sala</p>
                </div>
                <div className="w-px bg-gray-300"></div>
                <div className="text-center px-4">
                  <p className="font-serif font-bold text-xl text-[#775a19]">Auto</p>
                  <p className="font-sans text-[10px] text-[#7f7667] font-semibold">Escalonamento</p>
                </div>
              </div>
            </div>

            <RoomList
              rooms={rooms}
              onJoinRoom={handleJoinRoom}
              isLoading={false}
            />
          </div>
        )}

        {view === "chat" && activeRoom && currentUser && (
          <ChatWindow
            room={activeRoom}
            messages={messages}
            currentUser={currentUser}
            onSendMessage={handleSendMessage}
            onLikeMessage={handleLikeMessage}
            onDislikeMessage={handleDislikeMessage}
            onReportMessage={handleReportMessage}
            onLeaveRoom={handleLeaveRoom}
            externalLinks={externalLinks || undefined}
            isAdmin={!!(currentUser && (currentUser.role === "admin" || currentUser.role === "owner" || currentUser.role === "moderator" || !!adminToken))}
            onDeleteMessage={handleDeleteMessage}
          />
        )}

        {view === "admin-login" && (
          <div className="w-full max-w-md mx-auto py-12" id="admin_login_container">
            <div className="bg-white p-8 rounded-2xl border border-[#ebe8df] shadow-md">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-[#1c1c17] flex items-center justify-center text-white mb-3">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-lg text-[#1c1c17]">Portal Administrativo EGE</h3>
                <p className="font-sans text-xs text-[#7f7667] mt-1">
                  Insira as credenciais de segurança para administrar as salas.
                </p>
              </div>

              {adminError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 mb-4 font-sans">
                  ⚠️ {adminError}
                </div>
              )}

              <form onSubmit={handleAdminSignInSubmit} className="space-y-4">
                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                    Nome de Usuário
                  </label>
                  <input
                    type="text"
                    placeholder="ex: admin"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] focus:ring-1 focus:ring-[#775a19] rounded-lg text-sm focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                    Senha de Acesso
                  </label>
                  <input
                    type="password"
                    placeholder="Digite a senha de controle"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] focus:ring-1 focus:ring-[#775a19] rounded-lg text-sm focus:outline-none"
                    required
                  />
                </div>

                {/* A caixa de credenciais de teste foi removida por motivos de segurança do portal */}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setView("rooms")}
                    className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold shadow-sm cursor-pointer"
                    id="admin_submit_login_button"
                  >
                    Entrar no Portal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === "admin" && adminToken && (
          <AdminPanel
            token={adminToken}
            role={adminRole}
            onLogoutAdmin={handleAdminLogout}
          />
        )}

      </main>

      {/* MODAL DE SENHA PARA ACESSO DIRETO POR LINK */}
      {directLockedRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-scale-up" id="direct_lock_modal">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-[#ffdea5] rounded-full flex items-center justify-center text-[#775a19] mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1c1c17]">Acessar Sala de Estudos</h3>
              <p className="font-sans text-xs text-[#7f7667] mt-1">
                A sala <strong className="text-[#1c1c17] font-semibold">{directLockedRoom.name}</strong> requer uma senha de autorização acadêmica.
              </p>
            </div>

            <form onSubmit={handleDirectUnlockSubmit} className="space-y-4 mt-6">
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Senha da Sala
                </label>
                <input
                  type="password"
                  placeholder="Digite a senha de acesso"
                  value={directPasswordInput}
                  onChange={(e) => setDirectPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-sm font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                  autoFocus
                />
              </div>

              {directPasswordError && (
                <p className="text-xs text-red-600 font-sans font-semibold bg-red-50 p-2 rounded-lg border border-red-100">
                  ⚠️ {directPasswordError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDirectLockedRoom(null)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Confirmar Acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE PERSONALIZAR APELIDO */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in" id="rename_modal">
            <h3 className="font-serif font-bold text-[#1c1c17] text-lg mb-1">Personalizar Identidade</h3>
            <p className="font-sans text-xs text-[#7f7667] mb-6">
              Altere o seu apelido anônimo gerado pelo sistema.
            </p>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Novo Apelido Acadêmico
                </label>
                <input
                  type="text"
                  placeholder="ex: Filosofo_Verde"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-sm font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-[#7f7667] font-sans mt-0.5">Sem espaços. Limite de 3 a 25 caracteres.</p>
              </div>

              {renameError && (
                <p className="text-xs text-red-600 font-sans font-bold bg-[#ffdad6] p-2 rounded-lg border border-red-100">
                  ⚠️ {renameError}
                </p>
              )}

              {renameSuccess && (
                <p className="text-xs text-[#3f6d38] font-sans font-bold bg-[#b9eeab] p-2 rounded-lg border border-[#3f6d38]/40 flex items-center gap-1 leading-none">
                  <Check className="w-3.5 h-3.5" /> Nome alterado com sucesso!
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-bold shadow-sm cursor-pointer"
                >
                  Confirmar Nome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rodapé Customizado */}
      <footer className="py-6 border-t border-[#ebe8df] text-center shrink-0 w-full select-none">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-sans text-[11px] text-[#7f7667] font-medium">
            © 2026 EGE Chat Rooms. Estúdios de Grupos de Estudos. Todos os direitos reservados.
          </p>
          <div className="flex gap-4 font-sans text-[11px] font-bold text-[#775a19]">
            <a href={externalLinks?.diretrizesComunidade || "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">Diretrizes da Comunidade</a>
            <a href={externalLinks?.privacidade || "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">Privacidade</a>
            <a href={externalLinks?.manualModeracao || "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">Manual de Moderação</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
