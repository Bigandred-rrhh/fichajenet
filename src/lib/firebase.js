// src/lib/firebase.js
// ─────────────────────────────────────────────────────────────────
// INSTRUCCIONES: Sustituye los valores de abajo con los de tu
// proyecto Firebase (los obtienes en el Paso 2 de la guía).
// ─────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyBQd2LSM795Cp-tGF5s0hfVXcGq0-Oh2js",
  authDomain:        "fichajenet.firebaseapp.com",
  projectId:         "fichajenet",
  storageBucket:     "fichajenet.firebasestorage.app",
  messagingSenderId: "448334184505",
  appId:             "1:448334184505:web:93d06781f9b55b929ccde8"
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
