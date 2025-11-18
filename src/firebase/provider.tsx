'use client';
import {
  createContext,
  useContext,
} from 'react';
import type {
  FirebaseApp,
} from 'firebase/app';
import type {
  Auth,
} from 'firebase/auth';
import type {
  Firestore,
} from 'firebase/firestore';

interface FirebaseContextValue {
  app?: FirebaseApp;
  auth?: Auth;
  firestore?: Firestore;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: FirebaseContextValue;
}) {
  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

export const useFirebaseApp = () => {
  const { app } = useFirebase();
  if (!app) {
    throw new Error('Firebase app not available');
  }
  return app;
};

export const useAuth = () => {
  const { auth } = useFirebase();
  if (!auth) {
    // This check should ideally not be hit on the client-side
    // after the provider is set up correctly.
    throw new Error('Firebase Auth not available');
  }
  return auth;
};

export const useFirestore = () => {
  const { firestore } = useFirebase();
  if (!firestore) {
    // This check should ideally not be hit on the client-side.
    throw new Error('Firestore not available');
  }
  return firestore;
};
