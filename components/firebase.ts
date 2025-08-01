// firebase.ts
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";

// Define a reusable model type
export interface ModelData {
  path: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: [number, number, number];
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const modelsCollection = collection(db, "models");

export async function fetchModels(): Promise<(ModelData & { id: string })[]> {
  const snapshot: QuerySnapshot<DocumentData> = await getDocs(modelsCollection);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as ModelData),
  }));
}

export async function saveModel(id: string, data: ModelData): Promise<void> {
  const modelDoc = doc(db, "models", id);
  await setDoc(modelDoc, data, { merge: true });
}

export { db };
