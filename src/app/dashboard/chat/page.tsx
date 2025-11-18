import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MessagesSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
      </div>
      <Card className="flex flex-col items-center justify-center text-center p-10 min-h-[400px] border-2 border-dashed">
        <CardHeader>
          <div className="mx-auto bg-secondary rounded-full p-6 w-fit mb-4">
            <MessagesSquare className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Chat Is Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Soon you'll be able to chat with teachers and classmates here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
