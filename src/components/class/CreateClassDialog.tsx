
'use client';

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";

import { useFirestore, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  name: z.string().min(3, { message: "Class name must be at least 3 characters." }),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateClassDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}


export function CreateClassDialog({ isOpen, onOpenChange }: CreateClassDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  async function onSubmit(values: FormValues) {
    if (!user || !firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to create a class.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Generate a unique room name for Jitsi
      const jitsiRoomName = `city-school-hub-${crypto.randomUUID()}`;

      await addDoc(collection(firestore, "classes"), {
        name: values.name,
        description: values.description || "",
        teacherId: user.uid,
        studentIds: [],
        isLive: false,
        jitsiRoomName: jitsiRoomName,
      });

      toast({
        title: "Class Created!",
        description: `The class "${values.name}" has been created.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating class:", error);
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: error.message || "Could not create the class. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Class</DialogTitle>
          <DialogDescription>
            Fill out the details below to create a new class.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Grade 10 English" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What will this class cover?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
                Create Class
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
