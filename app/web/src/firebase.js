import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Importamos Firestore para las minutas

// Tus credenciales reales de la app Web
const firebaseConfig = {
  apiKey: "AIzaSyCZ7qUD9g6p76M2gUD72J8QH3jXtzTX7ag",
  authDomain: "sago-minutas.firebaseapp.com",
  projectId: "sago-minutas",
  storageBucket: "sago-minutas.firebasestorage.app",
  messagingSenderId: "672807690917",
  appId: "1:672807690917:web:4ee039ec357716428c234c",
  measurementId: "G-GG2MWKG297"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Inicializamos y exportamos la base de datos para que la lea el Dashboard
export const db = getFirestore(app);