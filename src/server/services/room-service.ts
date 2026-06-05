import { db } from "../db";
import { Room } from "../../types.ts";

export class RoomService {
  
  public getRooms(): Room[] {
    return db.getRooms();
  }

  public getRoom(roomId: string): Room | undefined {
    return db.getRoom(roomId);
  }

  public getRoomByName(name: string): Room | undefined {
    return db.getRoomByName(name);
  }

  public getOrCreateRoomWithScaling(roomId: string): Room {
    return db.getOrCreateRoomWithScaling(roomId);
  }

  public incrementRoomUsers(roomId: string): Room {
    return db.incrementRoomUsers(roomId);
  }

  public joinRoomWithScaling(roomId: string, userId: string): Room {
    return db.joinRoomWithScaling(roomId, userId);
  }

  public leaveRoom(roomId: string): void {
    db.leaveRoom(roomId);
  }

  public updateRoomConfig(
    roomId: string,
    updates: { name?: string; status?: "open" | "locked" | "read-only"; visibility?: "public" | "hidden"; password?: string; max_users?: number; pinnedMessage?: string; ctaLink?: string; ctaText?: string; }
  ): Room {
    return db.updateRoomConfig(roomId, updates);
  }

  public createRoom(roomData: Partial<Room>): Room {
    return db.createRoom(roomData);
  }

  public deleteRoom(roomId: string): boolean {
    return db.deleteRoom(roomId);
  }

  // --- Novos wrappers solicitados para painel admin ---

  public updateRoomName(roomId: string, newName: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    return db.updateRoomConfig(roomId, { name: newName });
  }

  public toggleVisibility(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    const newVisibility = room.visibility === "hidden" ? "public" : "hidden";
    return db.updateRoomConfig(roomId, { visibility: newVisibility });
  }

  public setPassword(roomId: string, password?: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    if (!password || password.trim() === "") throw new Error("Senha não pode ser vazia.");
    return db.updateRoomConfig(roomId, { status: "locked", password: password });
  }

  public removePassword(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    return db.updateRoomConfig(roomId, { status: "open", password: undefined });
  }

  public toggleReadOnly(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    const newStatus = room.status === "read-only" ? "open" : "read-only";
    return db.updateRoomConfig(roomId, { status: newStatus });
  }
}

export const roomService = new RoomService();
