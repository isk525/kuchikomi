import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const config={apiKey:"AIzaSyDdI9B-vZUNlBEpkrujxLaxDNWmgAdNouM",authDomain:"kuchikomi-web.firebaseapp.com",projectId:"kuchikomi-web",storageBucket:"kuchikomi-web.firebasestorage.app",messagingSenderId:"70374620856",appId:"1:70374620856:web:05c78cf05f33415497be4d"};
const app=initializeApp(config);export const auth=getAuth(app);export const db=getFirestore(app);
export function ensureAuth(){return new Promise((resolve,reject)=>{const stop=onAuthStateChanged(auth,async user=>{if(user){stop();resolve(user);return}try{await signInAnonymously(auth)}catch(e){stop();reject(e)}})})}
