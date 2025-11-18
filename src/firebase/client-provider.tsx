'use client';
import { firebaseServices } from './index';
import { FirebaseProvider } from './provider';
import React from "react";

export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseProvider value={firebaseServices}>
      {children}
    </FirebaseProvider>
  );
}
