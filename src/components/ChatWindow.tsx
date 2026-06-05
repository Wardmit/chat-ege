import React, { useState, useRef, useEffect, useMemo } from "react";
import { Message, Room, User } from "../types";
import { Send, ArrowLeft, Users, ThumbsUp, ThumbsDown, Flag, Smile, AlertCircle, VolumeX, ShieldAlert, Reply, X, ExternalLink } from "lucide-react";
import { apiFetch } from "../api";
import { getAppUrl } from "../config/env";

interface ChatWindowProps {
  room: Room;
  messages: Message[];
  currentUser: User;
  onSendMessage: (content: string) => void;
  onLikeMessage: (messageId: string) => void;
  onDislikeMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onLeaveRoom: () => void;
  showSystemMessage?: string;
  externalLinks?: { egeGames?: string; escolaEGE?: string; salaProfessores?: string };
  isAdmin?: boolean;
  onDeleteMessage?: (messageId: string) => void;
}

export default function ChatWindow({
  room,
  messages,
  currentUser,
  onSendMessage,
  onLikeMessage,
  onDislikeMessage,
  onReportMessage,
  onLeaveRoom,
  showSystemMessage,
  externalLinks,
  isAdmin = false,
  onDeleteMessage = () => {}
}: ChatWindowProps) {
  const [typedMessage, setTypedMessage] = useState("");
  const [inputError, setInputError] = useState("");
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reportModalMessageId, setReportModalMessageId] = useState<string | null>(null);
  const [showLinksDropdown, setShowLinksDropdown] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const linksDropdownRef = useRef<HTMLDivElement>(null);

  // Estados para autocomplete de menções
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // Extrair usuários online a partir das mensagens + usuário logado + usuários padrão
  const onlineUsers = useMemo(() => {
    const usersSet = new Set<string>();
    if (currentUser) {
      usersSet.add(currentUser.username);
    }
    // Adicionar os membros estáticos padrão do painel lateral
    usersSet.add("Acadêmico_Tutor");
    usersSet.add("Matheus_102");
    
    // Adicionar quem mandou mensagem na sala
    messages.forEach((msg) => {
      if (msg.username && !msg.hidden) {
        usersSet.add(msg.username);
      }
    });
    
    return Array.from(usersSet);
  }, [messages, currentUser]);

  // Filtrar sugestões com base na busca por menção
  const filteredSuggestions = useMemo(() => {
    if (!isMentionOpen) return [];
    const query = mentionQuery.toLowerCase();
    return onlineUsers
      .filter((username) => username.toLowerCase().includes(query))
      .slice(0, 8);
  }, [onlineUsers, isMentionOpen, mentionQuery]);

  // Efeito para abrir/fechar e buscar consultas de menção no input
  useEffect(() => {
    const match = typedMessage.match(/(^|\s)@(\w*)$/);
    if (match) {
      setIsMentionOpen(true);
      setMentionQuery(match[2]);
      setMentionIndex(0);
    } else {
      setIsMentionOpen(false);
      setMentionQuery("");
    }
  }, [typedMessage]);

  // Fechar autocomplete de menções ao clicar fora
  useEffect(() => {
    function handleClickOutsideMention(event: MouseEvent) {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(event.target as Node)) {
        setIsMentionOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideMention);
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideMention);
    };
  }, []);

  const handleCTAClick = (e: React.MouseEvent<HTMLAnchorElement>, triggerType: "pinned" | "time" | "interaction", baseLink: string) => {
    e.preventDefault();
    
    let sessionId = sessionStorage.getItem("ege_session_id");
    if (!sessionId) {
      sessionId = `sess_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem("ege_session_id", sessionId);
    }

    // Disparar tracking fire-and-forget
    apiFetch("/api/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        roomId: room.id,
        triggerType,
        sessionId
      }),
      keepalive: true
    }).catch(err => console.error("Tracking error:", err));

    // Abrir URL formatada
    const separator = baseLink.includes("?") ? "&" : "?";
    const finalUrl = `${baseLink}${separator}source=chat&room=${room.id}&trigger=${triggerType}&session=${sessionId}`;
    window.open(finalUrl, "_blank");
  };

  // --- SMART TRIGGERS (CTAs Locais) ---
  useEffect(() => {
    if (!room.ctaLink) return;
    
    const triggerKey = `cta_triggered_${room.id}`;
    if (sessionStorage.getItem(triggerKey)) return;

    const timer = setTimeout(() => {
      if (sessionStorage.getItem(triggerKey)) return;
      sessionStorage.setItem(triggerKey, "true");
      
      setLocalMessages(prev => [...prev, {
        id: `local_time_${Date.now()}`,
        room_id: room.id,
        user_id: "system",
        username: "Sistema EGE",
        role: "admin",
        content: "Você já está acompanhando a conversa há alguns minutos 👀\nQue tal ver um material organizado sobre esse tema?",
        timestamp: new Date().toISOString(),
        likes_count: 0, dislikes_count: 0, reports_count: 0, hidden: false,
        ctaLocal: { text: room.ctaText || "Ver Material", link: room.ctaLink }
      } as unknown as Message]);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearTimeout(timer);
  }, [room.id, room.ctaLink, room.ctaText]);

  useEffect(() => {
    if (!room.ctaLink) return;
    
    const triggerKey = `cta_triggered_${room.id}`;
    const myMessagesCount = messages.filter(m => m.user_id === currentUser.id).length;
    
    if (myMessagesCount >= 10) {
      if (!sessionStorage.getItem(triggerKey)) {
        sessionStorage.setItem(triggerKey, "true");
        setLocalMessages(prev => [...prev, {
          id: `local_interaction_${Date.now()}`,
          room_id: room.id,
          user_id: "system",
          username: "Sistema EGE",
          role: "admin",
          content: "Você está bem ativo nessa discussão 🔥\nTemos um curso completo que pode acelerar muito seu aprendizado.",
          timestamp: new Date().toISOString(),
          likes_count: 0, dislikes_count: 0, reports_count: 0, hidden: false,
          ctaLocal: { text: room.ctaText || "Ver Curso", link: room.ctaLink }
        } as unknown as Message]);
      }
    }
  }, [messages, currentUser.id, room.id, room.ctaLink, room.ctaText]);
  // ------------------------------------

  const handleSelectMention = (username: string) => {
    const match = typedMessage.match(/(^|\s)@(\w*)$/);
    if (match) {
      const index = match.index ?? 0;
      const prefix = match[1]; // Ex: espaço anterior
      const newText = typedMessage.substring(0, index) + prefix + `@${username} `;
      setTypedMessage(newText.slice(0, 300));
    }
    setIsMentionOpen(false);
  };

  const links = {
    egeGames: externalLinks?.egeGames !== undefined && externalLinks?.egeGames !== "" ? externalLinks.egeGames : "https://games.ege.edu.br",
    escolaEGE: externalLinks?.escolaEGE !== undefined && externalLinks?.escolaEGE !== "" ? externalLinks.escolaEGE : "https://escola.ege.edu.br",
    salaProfessores: externalLinks?.salaProfessores !== undefined && externalLinks?.salaProfessores !== "" ? externalLinks.salaProfessores : "https://professores.ege.edu.br"
  };

  const renderFormattedText = (msg: Message) => {
    const text = msg.formattedText || msg.content;
    const ranges = msg.formatRanges || [];
    
    const segments: { text: string; isBold: boolean }[] = [];
    let currentIndex = 0;
    
    for (const range of ranges) {
      if (range.start > currentIndex) {
        segments.push({ text: text.substring(currentIndex, range.start), isBold: false });
      }
      segments.push({ text: text.substring(range.start, range.end), isBold: true });
      currentIndex = range.end;
    }
    
    if (currentIndex < text.length) {
      segments.push({ text: text.substring(currentIndex), isBold: false });
    }

    const mentionRegex = /(@\w+)/g;

    return (
      <span className={msg.isBold ? "font-bold" : ""}>
        {segments.map((segment, idx) => {
          const parts = segment.text.split(mentionRegex);
          return (
            <React.Fragment key={idx}>
              {parts.map((part, i) => {
                if (part.match(mentionRegex)) {
                  return (
                    <span key={i} className="mention-tag bg-yellow-200 text-yellow-900 px-1 rounded font-bold">
                      {part}
                    </span>
                  );
                }
                if (segment.isBold) {
                  return <strong key={i}>{part}</strong>;
                }
                return part;
              })}
            </React.Fragment>
          );
        })}
      </span>
    );
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (linksDropdownRef.current && !linksDropdownRef.current.contains(event.target as Node)) {
        setShowLinksDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError("");

    const cleanContent = typedMessage.trim();
    if (typedMessage.length === 0) return;

    if (cleanContent.length > 300) {
      setInputError("Mensagem muito longa! Máximo de 300 caracteres.");
      return;
    }

    if (currentUser.status === "muted") {
      setInputError("Seu status atual está como SILENCIADO. Você não pode postar mensagens.");
      return;
    }

    onSendMessage(cleanContent, replyingTo?.id);
    setTypedMessage("");
    setReplyingTo(null);
  };

  const remainingChars = 300 - typedMessage.length;

  const translateStatus = (status: string) => {
    switch (status) {
      case "locked":
        return "Privada";
      case "read-only":
        return "Apenas Leitura";
      case "open":
        return "Aberta";
      default:
        return status;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-110px)] bg-white rounded-2xl border border-[#ebe8df] overflow-hidden shadow-sm" id="chat_window_root">
      
      {/* Cabeçalho da Sala */}
      <header className="h-[72px] bg-[#fbf8f0] border-b border-[#ebe8df] flex justify-between items-center px-4 md:px-6 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
        {/* Esquerda: Título da sala */}
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="font-serif font-bold text-[#1c1c17] text-base md:text-lg truncate max-w-[120px] sm:max-w-[200px] md:max-w-[320px] lg:max-w-[400px]">
              {room.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 text-[11px] font-sans text-[#7f7667]">
                <span className="w-2 h-2 rounded-full bg-[#3b6934] animate-pulse"></span>
                {room.current_users} online
              </span>
              <span className="text-gray-300 text-xs">•</span>
              <span className="px-2 py-0.5 bg-[#ebe8df] rounded-full text-[9px] font-bold text-[#4e4639] uppercase tracking-wider">
                {translateStatus(room.status)}
              </span>
            </div>
          </div>
        </div>

        {/* Centro: Links Externos (Desktop) */}
        {(links.egeGames !== "disabled" || links.escolaEGE !== "disabled" || links.salaProfessores !== "disabled") && (
          <div className="hidden lg:flex items-center gap-3 px-4" id="external_links_mid_container">
            {links.egeGames && links.egeGames !== "disabled" && (
              <a
                href={links.egeGames}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#775a19] hover:bg-[#5f4713] text-white rounded-lg text-[10px] font-bold uppercase transition-all duration-200 hover:scale-[1.02] shadow-xs active:scale-[0.98]"
                title="Acesse o EGE Games"
              >
                <ExternalLink className="w-3 h-3" />
                <span>EGE Games</span>
              </a>
            )}
            {links.escolaEGE && links.escolaEGE !== "disabled" && (
              <a
                href={links.escolaEGE}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6934] hover:bg-[#2c4e27] text-white rounded-lg text-[10px] font-bold uppercase transition-all duration-200 hover:scale-[1.02] shadow-xs active:scale-[0.98]"
                title="Acesse a Escola EGE"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Escola EGE</span>
              </a>
            )}
            {links.salaProfessores && links.salaProfessores !== "disabled" && (
              <a
                href={links.salaProfessores}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4e4639] hover:bg-[#383229] text-white rounded-lg text-[10px] font-bold uppercase transition-all duration-200 hover:scale-[1.02] shadow-xs active:scale-[0.98]"
                title="Acesse a Sala dos Professores"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Sala dos Professores</span>
              </a>
            )}
          </div>
        )}

        {/* Direita: Dropdown Mobile + Membros Ativos */}
        <div className="flex items-center gap-2">
          {/* Mobile/Tablet: Dropdown com links */}
          {(links.egeGames !== "disabled" || links.escolaEGE !== "disabled" || links.salaProfessores !== "disabled") && (
            <div className="relative lg:hidden" ref={linksDropdownRef}>
              <button
                onClick={() => setShowLinksDropdown(!showLinksDropdown)}
                className={`p-2 rounded-lg text-xs font-semibold font-sans flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                  showLinksDropdown 
                    ? "bg-[#775a19] text-white" 
                    : "bg-[#ebe8df]/40 text-[#4e4639] hover:bg-[#ebe8df]/85 border border-[#ebe8df]"
                }`}
                title="Links de Acesso Rápido"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Links</span>
              </button>

              {showLinksDropdown && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-[#ebe8df] shadow-lg py-1.5 z-50 animate-fade-in">
                  <div className="px-3 py-1 border-b border-[#ebe8df] mb-1">
                    <p className="text-[9px] uppercase font-bold text-[#7f7667] tracking-wider">Acesso Rápido</p>
                  </div>
                  {links.egeGames && links.egeGames !== "disabled" && (
                    <a
                      href={links.egeGames}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#775a19] hover:bg-[#fbf8f0] transition-colors"
                      onClick={() => setShowLinksDropdown(false)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#775a19]"></span>
                      <span>EGE Games</span>
                    </a>
                  )}
                  {links.escolaEGE && links.escolaEGE !== "disabled" && (
                    <a
                      href={links.escolaEGE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#3b6934] hover:bg-[#fbf8f0] transition-colors"
                      onClick={() => setShowLinksDropdown(false)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3b6934]"></span>
                      <span>Escola EGE</span>
                    </a>
                  )}
                  {links.salaProfessores && links.salaProfessores !== "disabled" && (
                    <a
                      href={links.salaProfessores}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#4e4639] hover:bg-[#fbf8f0] transition-colors"
                      onClick={() => setShowLinksDropdown(false)}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4e4639]"></span>
                      <span>Sala dos Professores</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowUserPanel(!showUserPanel)}
            className={`p-2 rounded-lg text-xs font-semibold font-sans flex items-center gap-1.5 cursor-pointer transition-colors ${
              showUserPanel ? "bg-[#775a19] text-white" : "text-[#4e4639] hover:bg-[#ebe8df]/50"
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Membros Ativos</span>
          </button>
        </div>
      </header>

      {/* Área de mensagens e aba lateral */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* Stream de Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#fcf9f0] space-y-4 shadow-inner">
          <div className="flex flex-col gap-4 max-w-4xl mx-auto pb-4">
            
            {(room.pinnedMessage || (room.ctaText && room.ctaLink)) && (
              <div className="bg-[#fdfaec] border border-[#f5e3bc] p-3 rounded-2xl shadow-sm mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in sticky top-0 z-10">
                <div className="flex items-start gap-2.5 text-[#775a19]">
                   <span className="text-lg">📌</span>
                   {room.pinnedMessage && (
                     <p className="font-sans text-sm font-bold leading-tight pt-0.5">{room.pinnedMessage}</p>
                   )}
                </div>
                {room.ctaLink && room.ctaText && (
                  <a href={room.ctaLink} onClick={(e) => handleCTAClick(e, "pinned", room.ctaLink!)} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-[#775a19] hover:bg-[#5f4713] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center text-center">
                    {room.ctaText}
                  </a>
                )}
              </div>
            )}

            <div className="flex justify-center my-2">
              <span className="px-3 py-1 bg-[#ebe8df]/70 rounded-full font-sans text-[10px] uppercase font-bold text-[#4e4639] tracking-wider">
                Início do Histórico
              </span>
            </div>

            {messages.length === 0 && localMessages.length === 0 ? (
              <div className="text-center p-8 text-[#7f7667] font-sans text-xs">
                Nenhuma mensagem postada nesta sala ainda. Seja o primeiro acadêmico a debater!
              </div>
            ) : (
              [...messages, ...localMessages].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((msg) => {
                const isMyMessage = msg.user_id === currentUser.id;
                
                return (
                  <div key={msg.id} onClick={() => setSelectedMessageId(msg.id === selectedMessageId ? null : msg.id)} className={`flex gap-3 group items-start max-w-[85%] cursor-pointer transition-all ${isMyMessage ? "ml-auto flex-row-reverse mr-[1cm]" : "mr-auto"} ${selectedMessageId === msg.id ? "ring-2 ring-[#775a19] ring-opacity-50 rounded-2xl" : ""}`}>
                    {!isMyMessage && (
                      msg.user_id === "system" ? (
                        <div className="w-9 h-9 rounded-full bg-[#3b6934] text-white font-sans font-bold flex items-center justify-center shadow-sm shrink-0 text-xs">
                          EGE
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#c5a059] text-[#4e3700] font-sans font-bold flex items-center justify-center shadow-sm shrink-0 uppercase text-xs">
                          {msg.username.slice(0, 2)}
                        </div>
                      )
                    )}
                    
                    {/* Exibir contexto de reposta se houver */}
                    {msg.replyTo && (
                      <div className={`flex items-center gap-2 mb-1 ${isMyMessage ? "flex-row-reverse" : "flex-row"}`}>
                        <div className="w-4 h-4 border-l-2 border-b-2 border-gray-300 rounded-bl-lg shrink-0"></div>
                        <div className="bg-[#ebe8df] px-3 py-1.5 rounded-lg text-xs text-[#7f7667] max-w-sm truncate border border-gray-200">
                          <span className="font-bold mr-1">@{msg.replyTo.username}:</span>
                          {msg.replyTo.text}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-col max-w-[85%] md:max-w-[75%]">
                      <div className={`flex items-baseline gap-2 mb-1 px-1 ${isMyMessage ? "flex-row-reverse" : ""}`}>
                        <span className="font-sans font-bold text-xs text-[#4e4639]">
                          {msg.username}
                        </span>
                        {(msg.role === "admin" || msg.role === "owner") && (
                           <span className="bg-[#775a19] text-white px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase shadow-sm">
                             ✓ EGE Oficial
                           </span>
                        )}
                        <span className="font-sans text-[9px] text-[#a09787]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className={`px-4 py-3 shadow-xs ${
                        isMyMessage 
                          ? "bg-[#775a19] text-white rounded-2xl rounded-tr-sm" 
                          : (msg.role === "admin" || msg.role === "owner")
                            ? "bg-[#fdfaec] border border-[#f5e3bc] text-[#1c1c17] rounded-2xl rounded-tl-sm shadow-md"
                            : "bg-white border border-[#ebe8df] text-[#1c1c17] rounded-2xl rounded-tl-sm"
                      }`}>
                        {msg.hidden ? (
                          <span className="italic opacity-60 flex items-center gap-2 text-xs">
                            <VolumeX className="w-3.5 h-3.5" /> Mensagem removida por violação de regras
                          </span>
                        ) : (
                          <div className="font-sans text-[13px] md:text-[14px] leading-relaxed break-words [word-break:normal] whitespace-pre-wrap">
                            {renderFormattedText(msg)}
                          </div>
                        )}
                      </div>
                      
                      {(msg as any).ctaLocal && (
                        <div className={`mt-2 flex ${isMyMessage ? "justify-end" : "justify-start"}`}>
                           <a href={(msg as any).ctaLocal.link} onClick={(e) => handleCTAClick(e, (msg as any).id.includes("time") ? "time" : "interaction", (msg as any).ctaLocal.link)} target="_blank" rel="noopener noreferrer" className="bg-[#775a19] hover:bg-[#5f4713] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm">
                             {(msg as any).ctaLocal.text}
                           </a>
                        </div>
                      )}

                      {msg.links && msg.links.length > 0 && (
                        <div className={`mt-1.5 flex flex-col gap-2 w-full max-w-sm ${isMyMessage ? "items-end" : "items-start"}`}>
                          {msg.links.slice(0, 2).map((link, idx) => {
                            let type = link.type;
                            if (!type) {
                               try {
                                  const urlObj = new URL(link.url);
                                  const host = urlObj.hostname.toLowerCase();
                                  const path = urlObj.pathname.toLowerCase();
                                  if (host.includes("youtube.com") || host.includes("youtu.be")) type = "video";
                                  else if (host.includes("drive.google.com") || host.includes("dropbox.com") || host.includes("onedrive.live.com")) type = "cloud";
                                  else if (path.endsWith(".pdf")) type = "pdf";
                                  else if (path.endsWith(".jpg") || path.endsWith(".png") || path.endsWith(".gif") || path.endsWith(".webp")) type = "image";
                                  else type = "generic";
                               } catch (e) {
                                  type = "generic";
                               }
                            }

                            let youtubeId = "";
                            if (type === "video") {
                               try {
                                  const urlObj = new URL(link.url);
                                  if (urlObj.hostname.includes("youtu.be")) {
                                     youtubeId = urlObj.pathname.slice(1);
                                  } else {
                                     youtubeId = urlObj.searchParams.get("v") || "";
                                  }
                               } catch(e) {}
                            }

                            return (
                              <div key={idx} className="bg-[#fbf8f0] border border-[#ebe8df] rounded-xl p-2.5 w-full shadow-sm flex flex-col gap-2.5">
                                {type === "image" && (
                                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="block max-h-[200px] overflow-hidden rounded-lg bg-[#ebe8df]/40 flex items-center justify-center">
                                    <img src={link.url} alt="Preview" className="max-h-[200px] w-auto object-contain" loading="lazy" />
                                  </a>
                                )}
                                {type === "video" && youtubeId && (
                                  <div className="relative rounded-lg overflow-hidden border border-[#ebe8df] bg-[#ebe8df]/40">
                                    <img src={`https://img.youtube.com/vi/${youtubeId}/0.jpg`} alt="YouTube Thumbnail" className="w-full h-auto object-cover opacity-95" loading="lazy" />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      <div className="w-10 h-10 bg-black/70 rounded-full flex items-center justify-center text-white shadow-md">
                                         <span className="ml-0.5 text-xs">▶</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-bold text-[#4e4639] truncate">
                                    {type === "pdf" && "📄 Documento compartilhado"}
                                    {type === "cloud" && "📎 Arquivo compartilhado"}
                                    {type === "video" && "🎥 Vídeo compartilhado"}
                                    {type === "image" && "🖼️ Imagem compartilhada"}
                                    {type === "generic" && "🔗 Link compartilhado"}
                                  </span>
                                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-[#775a19] bg-[#ebe8df] hover:bg-[#d1c5b4] px-2.5 py-1.5 rounded-lg transition-colors shrink-0 text-center uppercase tracking-wider">
                                    {type === "video" ? "Assistir vídeo" : (type === "generic" ? "Abrir link" : "Abrir arquivo")}
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Interações */}
                      {msg.user_id !== "system" && (
                        <div className={`flex gap-3 items-center mt-1 px-1 ${isMyMessage ? "justify-end" : ""}`}>
                          <button
                            onClick={() => onLikeMessage(msg.id)}
                            className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                              msg.reactions?.[currentUser.id] === "like" ? "text-[#3b6934] font-bold" : "text-[#7f7667] hover:text-[#3b6934]"
                            }`}
                          title="Gostei"
                        >
                          <ThumbsUp className={`w-3.5 h-3.5 ${msg.reactions?.[currentUser.id] === "like" ? "fill-current" : ""}`} />
                          <span className="text-[11px] font-sans font-medium">{msg.likes_count}</span>
                        </button>

                        <button
                          onClick={() => onDislikeMessage(msg.id)}
                          className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                            msg.reactions?.[currentUser.id] === "dislike" ? "text-red-700 font-bold" : "text-[#7f7667] hover:text-red-700"
                          }`}
                          title="Não gostei"
                        >
                          <ThumbsDown className={`w-3.5 h-3.5 ${msg.reactions?.[currentUser.id] === "dislike" ? "fill-current" : ""}`} />
                          <span className="text-[11px] font-sans font-medium">{msg.dislikes_count}</span>
                        </button>

                        {!isMyMessage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportModalMessageId(msg.id);
                            }}
                            className="flex items-center gap-1 text-[#7f7667] hover:text-red-600 transition-colors cursor-pointer ml-1"
                            title="Sinalizar / Denunciar Abuso"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            {msg.reports_count > 0 && (
                              <span className="text-[11px] font-sans text-red-600 font-bold bg-[#ffdad6] px-1 rounded">
                                {msg.reports_count}
                              </span>
                            )}
                          </button>
                        )}
                        
                        {(selectedMessageId === msg.id || isMyMessage === false) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyingTo(msg);
                            }}
                            className={`flex items-center gap-1 text-[#7f7667] hover:text-[#775a19] transition-colors cursor-pointer ml-2 ${selectedMessageId === msg.id ? "bg-[#d1c5b4] text-[#1c1c17]" : "bg-[#ebe8df]/40"} px-2 py-0.5 rounded-full`}
                            title="Responder"
                          >
                            <Reply className="w-3 h-3" />
                            <span className="text-[10px] font-bold">Responder</span>
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const confirmDelete = window.confirm("Deseja realmente deletar esta mensagem de forma permanente?");
                              if (confirmDelete) {
                                onDeleteMessage(msg.id);
                              }
                            }}
                            className="flex items-center gap-1 text-red-600 hover:text-red-800 hover:font-bold transition-all cursor-pointer ml-2 bg-red-50 hover:bg-red-100 px-2.5 py-0.5 rounded-full border border-red-200"
                            title="Deletar Mensagem (Admin)"
                          >
                            <span className="text-[12px]">🗑️</span>
                            <span className="text-[10px] font-bold">Deletar</span>
                          </button>
                        )}
                      </div>
                      )}

                    </div>
                  </div>
                );
              })
            )}

            {/* Avisos do sistema e Mute */}
            {(showSystemMessage || currentUser.status === "muted") && (
              <div className="flex justify-center my-2 max-w-xl mx-auto w-full">
                <span className="font-sans text-[11px] text-[#775a19] flex items-center gap-1.5 bg-[#ffdea5]/40 border border-[#ffdea5] px-4 py-2 rounded-xl text-center">
                  <AlertCircle className="w-3.5 h-3.5 text-[#775a19] shrink-0" />
                  <span>
                    {currentUser.status === "muted"
                      ? "Atenção acadêmico: Seu canal está marcado como SILENCIADO pelo administrador. Apenas leitura permitida."
                      : showSystemMessage}
                  </span>
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Membros Conectados */}
        {showUserPanel && (
          <aside className="w-56 shrink-0 bg-white border-l border-[#ebe8df] p-4 flex flex-col justify-between animate-slide-left z-20 shadow-md">
            <div>
              <h3 className="font-serif font-bold text-[#1c1c17] text-sm mb-3">Integrantes Conectados</h3>
              <p className="font-sans text-[11px] text-[#7f7667] mb-4">
                Total de acadêmicos discutindo no canal agora.
              </p>
              
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {onlineUsers.map((user) => {
                  const isMe = user === currentUser.username;
                  const initials = user.slice(0, 2).toUpperCase();
                  
                  let bgColor = "bg-slate-400";
                  if (isMe) bgColor = "bg-[#3b6934]";
                  else if (user === "Acadêmico_Tutor") bgColor = "bg-[#775a19]";

                  return (
                    <div
                      key={user}
                      className={`flex items-center gap-2 p-1.5 rounded hover:bg-[#f6f3ea] transition-colors ${
                        isMe ? "" : "opacity-70"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${bgColor} text-white flex items-center justify-center text-[10px] font-sans font-bold uppercase shrink-0`}>
                        {initials}
                      </div>
                      <span className={`font-sans text-xs text-[#1c1c17] truncate ${isMe ? "font-bold" : ""}`} title={user}>
                        {user} {isMe && "(Você)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-[#ebe8df]">
              <div className="flex items-center gap-2 bg-[#f1eee5] p-2 rounded-xl text-center">
                <Users className="w-4 h-4 text-[#775a19]" />
                <span className="font-sans text-[10px] font-bold text-[#4e4639]">Instância Ativa</span>
              </div>
            </div>
          </aside>
        )}

      </div>

      {/* Caixa de Texto */}
      <footer className="p-3 bg-white border-t border-[#ebe8df] shrink-0 relative">
        
        {/* Respondendo A... UI */}
        {replyingTo && (
          <div className="absolute bottom-full left-0 right-0 bg-[#ebe8df] px-4 py-2 flex justify-between items-center border-t border-[#d1c5b4] text-xs z-10 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2 text-[#4e4639] truncate flex-1">
              <Reply className="w-4 h-4 text-[#775a19] shrink-0" />
              <span className="font-bold shrink-0">Respondendo a {replyingTo.username}:</span>
              <span className="truncate italic opacity-80">{replyingTo.content}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-[#7f7667] hover:text-red-700 ml-2 p-1 bg-white/50 rounded-full cursor-pointer shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Dropdown de Autocomplete de Menções */}
        {isMentionOpen && filteredSuggestions.length > 0 && (
          <div
            ref={mentionDropdownRef}
            className="absolute left-4 max-w-xs w-64 bg-white border border-[#ebe8df] rounded-xl shadow-lg overflow-hidden py-1 z-[45] animate-fade-in"
            style={{ bottom: replyingTo ? "calc(100% + 42px)" : "calc(100% + 8px)" }}
          >
            <div className="px-3 py-1 border-b border-[#ebe8df] bg-[#fbf8f0]">
              <p className="text-[9px] uppercase font-bold text-[#7f7667] tracking-wider">Mencionar Usuário</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredSuggestions.map((suggestion, idx) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSelectMention(suggestion)}
                  className={`w-full text-left px-3 py-2 text-xs font-sans flex items-center gap-2 cursor-pointer transition-colors ${
                    idx === mentionIndex ? "bg-[#775a19] text-white" : "text-[#1c1c17] hover:bg-[#f6f3ea]"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${idx === mentionIndex ? "bg-white" : "bg-emerald-600"}`}></span>
                  <span className={idx === mentionIndex ? "font-bold" : "font-semibold"}>@{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showEmojiPicker && (
          <div className="absolute bottom-full left-4 mb-2 bg-white border border-[#ebe8df] shadow-lg rounded-xl p-3 flex flex-wrap max-w-xs gap-2 text-xl animate-fade-in z-50">
            {["😀", "😃", "😄", "😁", "😆", "😂", "😎", "😍", "👍", "👎", "❤️", "🎉"].map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setTypedMessage(prev => (prev + emoji).slice(0, 300));
                  setShowEmojiPicker(false);
                  setInputError("");
                }}
                className="hover:scale-125 transition-transform cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendSubmit} className="flex-1 flex items-end gap-2 bg-[#fbf8f0] p-1.5 md:p-2 rounded-xl md:rounded-2xl border border-[#ebe8df] focus-within:ring-2 focus-within:ring-[#775a19]/20 focus-within:border-[#775a19]/40 transition-all">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 md:p-3 text-[#7f7667] hover:text-[#775a19] hover:bg-[#ebe8df] rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <Smile className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <textarea
            value={typedMessage}
            onChange={(e) => {
              setTypedMessage(e.target.value.slice(0, 300));
              setInputError("");
            }}
            placeholder={
              room.status === "read-only"
                ? "Este canal está em modo Somente Leitura..."
                : "Insira sua contribuição ao debate acadêmico..."
            }
            disabled={room.status === "read-only"}
            className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-2.5 md:py-3 px-2 text-[13px] md:text-[14px] font-sans text-[#1c1c17] placeholder-[#a09787]"
            onKeyDown={(e) => {
              if (isMentionOpen && filteredSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((prev) => (prev + 1) % filteredSuggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelectMention(filteredSuggestions[mentionIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsMentionOpen(false);
                  return;
                }
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendSubmit(e);
              }
            }}
            rows={1}
          />

          <button
            type="submit"
            disabled={!typedMessage || typedMessage.replace(/\s+/g, '').length === 0 || room.status === "read-only" || currentUser.status === "muted"}
            className="p-3 bg-[#775a19] text-white rounded-xl hover:brightness-105 transition-all cursor-pointer shrink-0 disabled:opacity-30 flex items-center justify-center shadow-sm active:scale-95"
            id="send_message_button"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>

        <div className="max-w-4xl mx-auto flex justify-between items-center px-2 mt-1.5">
          <span className="font-sans text-[10px] text-[#7f7667] hidden sm:inline">
            Pressione <strong>Enter</strong> para enviar, <strong>Shift + Enter</strong> para quebra de linha.
          </span>
          <span className={`font-sans text-[10px] font-bold ml-auto ${remainingChars < 20 ? "text-red-600 font-semibold" : "text-[#7f7667]"}`}>
            {remainingChars} / 300 caracteres restantes
          </span>
        </div>

        {inputError && (
          <p className="max-w-4xl mx-auto mt-2 text-xs text-red-600 font-sans font-bold bg-[#ffdad6] p-2 rounded-lg border border-red-200">
            ⚠️ {inputError}
          </p>
        )}
      </footer>

      {/* Report Modal */}
      {reportModalMessageId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-slide-up">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="font-serif font-bold text-xl text-[#1c1c17] mb-2">Sinalizar Abuso</h3>
              <p className="font-sans text-sm text-[#4e4639] mb-6">
                Você deseja denunciar esta mensagem por conduta imprópria? Mensagens com 5 denúncias são filtradas automaticamente do debate.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setReportModalMessageId(null)}
                  className="flex-1 py-3 bg-[#ebe8df] hover:bg-[#d1c5b4] text-[#4e4639] font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onReportMessage(reportModalMessageId);
                    setReportModalMessageId(null);
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-sm shadow-red-600/30 cursor-pointer"
                >
                  Denunciar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
