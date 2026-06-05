import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { User, Room, Message, Ban } from "../../types.ts";

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), "firebase-service-account.json");

class FirestoreService {
  public db: admin.firestore.Firestore | null = null;
  public isConnected: boolean = false;

  constructor() {

  console.log("🔥 FIREBASE ENV EXISTS:", !!process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log("🔥 FIREBASE ENV LENGTH:", process.env.FIREBASE_SERVICE_ACCOUNT?.length);

  console.log(
    "ENV FIREBASE RAW:",
    process.env.FIREBASE_SERVICE_ACCOUNT?.slice(0, 80)
  );

  try {
      if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
        
        if (!admin.apps.length) {
          const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

const serviceAccount = {
  ...raw,
  private_key: raw.private_key.replace(/\\n/g, "\n"),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
        }
        
        const db = admin.firestore();
        db.settings({ ignoreUndefinedProperties: true });
        this.db = db;
        this.isConnected = true;
        console.log("🔥 Firestore conectado com sucesso usando Service Account local.");
      } else {
        if (!admin.apps.length) {
          admin.initializeApp();
        }
        const db = admin.firestore();
        db.settings({ ignoreUndefinedProperties: true });
        this.db = db;
        this.isConnected = true;
        console.log("🔥 Firestore conectado com sucesso via Default Credentials.");
      }
    } catch (err: any) {
      console.warn("⚠️ Não foi possível conectar ao Firestore:", err.message);
      this.isConnected = false;
    }
  }

  public saveUser(user: User) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("users").doc(user.id).set(user, { merge: true }).catch(console.error);
  }

  public saveRoom(room: Room) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("rooms").doc(room.id).set(room, { merge: true }).catch(console.error);
  }

  public deleteRoom(roomId: string) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("rooms").doc(roomId).delete().catch(console.error);
  }

  public saveMessage(message: Message) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("messages").doc(message.id).set(message).catch(console.error);
  }

  public saveBan(ban: Ban) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("bans").doc(ban.id).set(ban).catch(console.error);
  }

  public async deleteBan(uuid?: string, ip?: string) {
    if (!this.isConnected || !this.db) return;
    try {
      const bansRef = this.db.collection("bans");
      let snapshot;
      if (uuid) snapshot = await bansRef.where("uuid", "==", uuid).get();
      else if (ip) snapshot = await bansRef.where("ip", "==", ip).get();
      
      if (snapshot && !snapshot.empty) {
        const batch = this.db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error(err);
    }
  }

  public saveConfig(key: string, data: any) {
    if (!this.isConnected || !this.db) return;
    this.db.collection("config").doc(key).set(data, { merge: true }).catch(console.error);
  }

  public async getInitialData() {
    if (!this.isConnected || !this.db) return null;
    try {
      const [usersSnap, roomsSnap, bansSnap, configSnap] = await Promise.all([
        this.db.collection("users").get(),
        this.db.collection("rooms").get(),
        this.db.collection("bans").get(),
        this.db.collection("config").get()
      ]);

      const data = {
        users: {} as Record<string, User>,
        rooms: {} as Record<string, Room>,
        bans: [] as Ban[],
        config: {} as any
      };

      usersSnap.docs.forEach(doc => { data.users[doc.id] = doc.data() as User; });
      roomsSnap.docs.forEach(doc => { data.rooms[doc.id] = doc.data() as Room; });
      bansSnap.docs.forEach(doc => { data.bans.push(doc.data() as Ban); });
      configSnap.docs.forEach(doc => { data.config[doc.id] = doc.data(); });

      return data;
    } catch (err) {
      console.error("Erro ao carregar dados do Firestore:", err);
      return null;
    }
  }
}

export const firestoreService = new FirestoreService();
