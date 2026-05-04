import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCpP7gIV4LZtTVlSoaBNBONAGyvsqxZy_g",
    authDomain: "our-bible-f3663.firebaseapp.com",
    projectId: "our-bible-f3663",
    storageBucket: "our-bible-f3663.firebasestorage.app",
    messagingSenderId: "812529233957",
    appId: "1:812529233957:web:a93b9d93a9bb56b9c88fcc"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
