import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';

type Notification = {
    title: string;
    body: string;
    link: string;
}

export async function sendNotification(firestore: Firestore, userId: string, notification: Notification) {
    if (!userId) {
        throw new Error("User ID is required to send a notification.");
    }
    const notificationsRef = collection(firestore, 'users', userId, 'notifications');
    await addDoc(notificationsRef, {
        ...notification,
        read: false,
        createdAt: serverTimestamp(),
    });
}

    