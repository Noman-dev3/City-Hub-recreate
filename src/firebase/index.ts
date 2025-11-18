'use client';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, indexedDBLocalPersistence, setPersistence } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

import { firebaseConfig } from './config';

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

// This function ensures that we initialize Firebase only once.
// It's safe to call this function multiple times.
function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  auth = getAuth(app);
  firestore = getFirestore(app);

  // Set persistence to local
  setPersistence(auth, indexedDBLocalPersistence);

  return { app, auth, firestore };
}

// We call the function to initialize Firebase and export the services.
// Because this file has 'use client', this code will only run on the client.
const firebaseServices = initializeFirebase();

export { firebaseServices, initializeFirebase };
export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';