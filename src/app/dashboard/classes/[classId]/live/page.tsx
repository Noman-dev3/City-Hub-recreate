'use client';
import { useEffect, useRef, useState } from "react";
import DailyIframe from '@daily-co/daily-js';

export default function LiveClassPage({ params }: any) {
  const roomId = params.roomId;
  const callFrameRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // User info (replace with Firebase later)
  const userId = "Noman-" + Math.random().toString(36).substring(2);
  const role: "teacher" | "student" = "teacher";

  // Create/get Daily room
  const getRoomUrl = async () => {
    try {
      const res = await fetch("/api/daily-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId, role })
      });
      const data = await res.json();
      return data.url; // Daily room URL
    } catch (err) {
      setError("Failed to create room");
      console.error(err);
      return null;
    }
  };

  useEffect(() => {
    let callFrame: any = null;

    const start = async () => {
      const roomUrl = await getRoomUrl();
      if (!roomUrl) return;

      // Create Daily call frame
      callFrame = DailyIframe.createFrame(
        document.getElementById("meet")!,
        {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0"
          }
        }
      );

      callFrameRef.current = callFrame;

      // Join the room
      await callFrame.join({ 
        url: roomUrl,
        userName: userId
      });

      setIsLoading(false);

      // Event listeners
      callFrame
        .on("joined-meeting", () => {
          console.log("✅ Joined meeting");
        })
        .on("left-meeting", () => {
          console.log("👋 Left meeting");
        })
        .on("error", (err: any) => {
          console.error("❌ Daily error:", err);
          setError("Connection error occurred");
        });
    };

    start();

    return () => {
      if (callFrame) {
        callFrame.destroy();
      }
    };
  }, [roomId]);

  return (
    <div style={{ height: "100vh", width: "100%", background: "#000", position: "relative" }}>
      {isLoading && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "#fff",
          fontSize: "18px"
        }}>
          Loading classroom...
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#ff4444",
          color: "#fff",
          padding: "12px 24px",
          borderRadius: "8px"
        }}>
          {error}
        </div>
      )}
      <div id="meet" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
