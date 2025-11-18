
'use client';
import { useState, useEffect } from 'react';
import { onSnapshot, collection, query, where, getDocs, doc, Query, DocumentData, CollectionReference } from 'firebase/firestore';
import { useFirestore } from '../provider';

interface Document {
  id: string;
  [key: string]: any;
}

export function useCollection<T extends DocumentData>(
  collectionRef: CollectionReference | Query | null,
  deps: any[] = []
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!collectionRef) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as T));
        setData(docs);
        setLoading(false);
      },
      (err) => {
        console.error("useCollection error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionRef, ...deps]);

  return { data, loading, error };
}
