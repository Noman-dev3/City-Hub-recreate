import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function FilesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Class Files</h1>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </Button>
      </div>
      <Card className="flex flex-col items-center justify-center text-center p-10 min-h-[400px] border-2 border-dashed">
        <CardHeader>
          <div className="mx-auto bg-secondary rounded-full p-6 w-fit mb-4">
            <Upload className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">No Files Uploaded</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Teachers can upload and manage class materials here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
