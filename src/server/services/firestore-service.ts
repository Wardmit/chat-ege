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

    try {

      let serviceAccount: any;

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        serviceAccount = {
          ...raw,
          private_key: raw.private_key.replace(/\\n/g, "\n"),
        };

        console.log("🔥 Usando Firebase via ENV (produção)");
      }

      else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        serviceAccount = JSON.parse(
          fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8")
        );

        console.log("🔥 Usando Firebase via arquivo local");
      }

      else {
        throw new Error("Firebase credentials not found");
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      const db = admin.firestore();
      db.settings({ ignoreUndefinedProperties: true });

      this.db = db;
      this.isConnected = true;

      console.log("🔥 Firestore conectado com sucesso");

    } catch (err: any) {
      console.warn("⚠️ Erro ao conectar Firestore:", err.message);
      this.isConnected = false;
    }
  }
} // 👈 ESSA CHAVE ESTAVA FALTANDO

export const firestoreService = new FirestoreService();
