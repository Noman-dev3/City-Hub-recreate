'use server';
import {
  Auth,
  GoogleAuthProvider,
  User,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';

export async function signInWithGoogle(
  auth: Auth,
  firestore: Firestore
): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // After successful sign-in, check if user exists in Firestore
    const userDocRef = doc(firestore, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // User is new, create a document in Firestore
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        fullName: user.displayName,
        role: 'student', // Default role for new Google sign-ups
      });
    }

    return user;
  } catch (error: any) {
    // Handle specific errors
    if (error.code === 'auth/popup-closed-by-user') {
      console.log('Google sign-in popup closed by user.');
      return null;
    }
    console.error('Error during Google sign-in:', error);
    // Re-throw other errors to be handled by the caller
    throw error;
  }
}
