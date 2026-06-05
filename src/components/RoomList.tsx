import React, { useState } from "react";
import { Room } from "../types";
import { Search, Lock, Users, School, HelpCircle, Eye, ShieldAlert, KeyRound } from "lucide-react";

interface RoomListProps {
  rooms: Room[];
  onJoinRoom: (roomId: string, password?: string) => void;
  isLoading: boolean;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Educação Infantil":
      return <School className="w-5 h-5 text-[#775a19]" />;
    case "Ciências Exatas":
      return <span className="font-serif font-bold text-lg text-[#775a19]">Δ</span>;
    case "Literatura Brasileira":
      return <span className="font-serif font-bold text-lg text-[#775a19]">📖</span>;
    default:
      return <span className="font-serif font-bold text-lg text-[#775a19]">💬</span>;
  }
};

export default function RoomList({ rooms, onJoinRoom, isLoading }: RoomListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "locked">("all");
  const [selectedLockRoom, setSelectedLockRoom] = useState<Room | null>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const filteredRooms = rooms.filter((room) => {
    // 1. Ocultar sub-salas de overflow
    if (room.parent_id) return false;

    // 2. Ocultar salas com visibilidade oculta (hidden) da página inicial
    if (room.visibility === "hidden") return false;

    const matchesSearch =
      room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "open" && room.status === "open") ||
      (activeFilter === "locked" && room.status === "locked");

    return matchesSearch && matchesFilter;
  });

  const handleRoomClick = (room: Room) => {
    if (room.status === "locked") {
      setSelectedLockRoom(room);
      setRoomPassword("");
      setPasswordError("");
    } else {
      onJoinRoom(room.id);
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLockRoom) return;

    if (!roomPassword.trim()) {
      setPasswordError("A senha não pode estar em branco.");
      return;
    }

    if (roomPassword === "123456" || roomPassword === selectedLockRoom.password) {
      onJoinRoom(selectedLockRoom.id, roomPassword);
      setSelectedLockRoom(null);
    } else {
      setPasswordError("Senha incorreta. Dica: Use a senha padrão '123456'.");
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none" id="room_list_root">
      {/* Busca e Abas */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#fbf8f0] p-4 rounded-xl border border-[#ebe8df] shadow-sm">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7f7667] w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar salas acadêmicas ou tópicos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#f6f3ea] border border-[#d1c5b4]/50 rounded-full focus:outline-none focus:ring-1 focus:ring-[#775a19] focus:border-[#775a19] font-sans text-sm text-[#1c1c17] transition-all"
            id="search_rooms_input"
          />
        </div>

        {/* Filtros por status */}
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === "all"
                ? "bg-[#775a19] text-white shadow-sm"
                : "bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da]"
            }`}
          >
            Todas as Salas
          </button>
          <button
            onClick={() => setActiveFilter("open")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === "open"
                ? "bg-[#3b6934] text-white shadow-sm"
                : "bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da]"
            }`}
          >
            🟢 Abertas
          </button>
          <button
            onClick={() => setActiveFilter("locked")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === "locked"
                ? "bg-[#c5a059] text-[#4e3700] shadow-sm"
                : "bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da]"
            }`}
          >
            🔒 Privadas
          </button>
        </div>
      </div>

      {/* Grid de Salas */}
      {filteredRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-[#ebe8df] text-center">
          <ShieldAlert className="w-12 h-12 text-[#7f7667] mb-2" />
          <h3 className="font-serif font-bold text-lg text-[#1c1c17]">Nenhuma sala encontrada</h3>
          <p className="font-sans text-sm text-[#4e4639] mt-1">
            Tente mudar os filtros de busca ou pesquise outro termo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12" id="grid_container_rooms">
          {filteredRooms.map((room) => {
            const isFull = room.current_users >= room.max_users;
            return (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room)}
                className="group relative bg-[#ffffff] hover:bg-[#f6f3ea] p-5 rounded-2xl border border-[#ebe8df] hover:border-[#775a19] transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-[0px_2px_4px_rgba(0,0,0,0.03)] hover:shadow-md hover:-translate-y-0.5"
                id={`room_card_${room.id}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#f1eee5] group-hover:bg-[#ebe8df] flex items-center justify-center font-bold text-sm border border-[#d1c5b4]/20 transition-colors">
                    {getCategoryIcon(room.category)}
                  </div>

                  {room.status === "locked" ? (
                    <span className="flex items-center gap-1 bg-[#ffdea5] text-[#4e3700] px-2.5 py-1 rounded-full text-[10px] font-bold">
                      <Lock className="w-2.5 h-2.5" />
                      Privada
                    </span>
                  ) : room.status === "read-only" ? (
                    <span className="flex items-center gap-1 bg-[#ebe8df] text-[#4e4639] px-2.5 py-1 rounded-full text-[10px] font-bold">
                      <Eye className="w-2.5 h-2.5" />
                      Apenas Leitura
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-[#b9eeab] text-[#3f6d38] px-2.5 py-1 rounded-full text-[10px] font-bold">
                      🟢 Aberta
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <h3 className="font-serif font-bold text-base text-[#1c1c17] group-hover:text-[#775a19] truncate transition-colors">
                    {room.name}
                  </h3>
                  <p className="font-sans text-xs text-[#4e4639] opacity-80 mt-1 line-clamp-1">
                    {room.category} • Discussões acadêmicas inteligentes.
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs font-sans text-[#7f7667]">
                  <span className="flex items-center gap-1 hover:text-[#1c1c17]">
                    <Users className="w-3.5 h-3.5" />
                    <span>{room.current_users} / {room.max_users} acadêmicos</span>
                  </span>
                  
                  {isFull && (
                    <span className="text-red-600 font-bold text-[10px] uppercase tracking-wide">
                      Lotado
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Senha para Salas Trancadas */}
      {selectedLockRoom && (
        <div className="fixed inset-0 bg-[#1c1c17]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-2xl border border-[#ebe8df] shadow-xl relative animate-fade-in animate-scale-up" id="lock_modal">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-[#ffdea5] rounded-full flex items-center justify-center text-[#775a19] mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1c1c17]">Entrar em Sala Privada</h3>
              <p className="font-sans text-xs text-[#7f7667] mt-1">
                A sala <strong className="text-[#1c1c17] font-semibold">{selectedLockRoom.name}</strong> requer uma senha de autorização acadêmica.
              </p>
            </div>

            <form onSubmit={handleUnlockSubmit} className="space-y-4 mt-6">
              <div>
                <label className="font-sans text-xs font-bold text-[#4e4639] block mb-1">
                  Senha da Sala
                </label>
                <input
                  type="password"
                  placeholder="Digite a senha de segurança"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f6f3ea] border border-[#d1c5b4] rounded-lg text-sm font-sans focus:outline-none focus:ring-1 focus:ring-[#775a19]"
                  required
                  autoFocus
                />
              </div>

              {passwordError && (
                <p className="text-xs text-red-600 font-sans font-semibold bg-red-50 p-2 rounded-lg border border-red-100">
                  ⚠️ {passwordError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLockRoom(null)}
                  className="flex-1 py-2 rounded-lg bg-[#ebe8df] text-[#4e4639] hover:bg-[#e5e2da] text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#775a19] text-white hover:brightness-105 text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
