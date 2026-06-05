import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { User, Room, Message, Ban } from "../../types.ts";

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), "firebase-service-account.json");

class FirestoreService {
  public db: admin.firestore.Firestore | null = null;
  public isConnected: boolean = false;

  constructor() {
    console.log("🔥 Verificando credenciais do Firebase...");

    try {
      let serviceAccount: any = null;

      // 1. Tenta carregar pela Variável de Ambiente (PRODUÇÃO NO RENDER)
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("🔥 Usando Firebase via ENV JSON (produção)");
      } 
      // 2. Tenta carregar pelo arquivo físico (DESENVOLVIMENTO LOCAL)
      else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
        console.log("🔥 Usando Firebase via arquivo local");
      } 
      // 3. Falha se nenhum dos dois existir
      else {
        throw new Error("Credenciais do Firebase não encontradas no ambiente ou no disco.");
      }

      // Inicializa o SDK explicitamente com as credenciais montadas
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      const db = admin.firestore();
      db.settings({ ignoreUndefinedProperties: true });

      this.db = db;
      this.isConnected = true;

      console.log("🔥 Firestore conectado com sucesso via credenciais validadas");

    } catch (err: any) {
      console.error("🚨 ERRO CRÍTICO AO CONECTAR FIRESTORE:", err.message);
      this.isConnected = false;
      
      // Derruba a aplicação imediatamente se o banco falhar (Evita servidor "zumbi")
      process.exit(1);
    }
  }
}

export const firestoreService = new FirestoreService();
