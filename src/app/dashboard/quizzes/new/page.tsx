
'use client';

import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { addDoc, collection, query, where, Query, serverTimestamp } from "firebase/firestore";
import React, { useState, useEffect, useMemo } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Bot, Pencil, Plus, Trash2, X, BookCopy } from "lucide-react";
import { useFirestore, useUser, useCollection } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { generateQuiz } from "@/ai/flows/generate-quiz-flow";
import { GenerateQuizInput, quizFormSchema, QuizFormValues, aiFormSchema, AiFormValues } from "@/ai/schemas";
import { Checkbox } from "@/components/ui/checkbox";

type Class = {
    id: string;
    name: string;
};

export default function NewQuizPage() {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("ai");

  const teacherClassesQuery = useMemo(() => {
      if (!user || !firestore) return null;
      return query(collection(firestore, "classes"), where("teacherId", "==", user.uid));
  }, [user, firestore]);

  const { data: teacherClasses, loading: classesLoading } = useCollection<Class>(teacherClassesQuery as Query);

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(quizFormSchema),
    defaultValues: {
      title: "",
      description: "",
      questions: [],
      classIds: [],
    },
  });

  const aiForm = useForm<AiFormValues>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: {
        topic: "",
        numQuestions: 3,
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  const addQuestion = (type: "mcq" | "true_false" | "short_answer") => {
    if (type === "mcq") {
      append({
        type: "mcq",
        text: "",
        options: [{ text: "" }, { text: "" }],
        correctAnswer: "",
      });
    } else if (type === "true_false") {
      append({
        type: "true_false",
        text: "",
        correctAnswer: "true",
        options: [],
      });
    } else {
      append({
        type: "short_answer",
        text: "",
        correctAnswer: "",
        options: [],
      });
    }
  };

  async function handleAiSubmit(data: AiFormValues) {
    setIsGenerating(true);
    try {
        const input: GenerateQuizInput = {
            topic: data.topic,
            numQuestions: data.numQuestions,
            questionTypes: ['mcq', 'true_false', 'short_answer'],
        };
        const quizData = await generateQuiz(input);
        
        // Keep selected classIds if they exist
        const currentClassIds = form.getValues('classIds');
        form.reset({ ...quizData, classIds: currentClassIds });
        
        toast({
            title: "Quiz Generated!",
            description: "The AI has created your quiz. Please review and save it.",
        });

        // Switch to the manual tab for review
        setActiveTab("manual");

    } catch (error) {
        console.error("AI Generation Error:", error);
        toast({
            variant: "destructive",
            title: "AI Generation Failed",
            description: "The AI could not generate the quiz. Please try again or create it manually.",
        });
    } finally {
        setIsGenerating(false);
    }
}


  async function onSubmit(data: QuizFormValues) {
    if (!user || !firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to create a quiz.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Create the main quiz document
      const quizRef = await addDoc(collection(firestore, "quizzes"), {
        title: data.title,
        description: data.description || "",
        creatorId: user.uid,
        classIds: data.classIds || [],
        createdAt: serverTimestamp(),
      });
      
      // Add each question to the 'questions' subcollection
      for (const question of data.questions) {
        const questionData = {...question};
        // The options array from react-hook-form can have extra properties,
        // so we need to clean it before saving.
        if (questionData.type === 'mcq' && questionData.options) {
             const cleanOptions = questionData.options.map(opt => opt.text);
             // We need to store the options array as an array of strings in Firestore
             // but our form schema expects an array of objects. So we create a temporary
             // object that matches the firestore structure.
            const firestoreQuestionData = {
                ...questionData,
                options: cleanOptions
            };
            await addDoc(collection(firestore, "quizzes", quizRef.id, "questions"), firestoreQuestionData);

        } else {
             // For non-MCQ, remove the empty options array if it exists
             if ('options' in questionData) {
                delete questionData.options;
             }
             await addDoc(collection(firestore, "quizzes", quizRef.id, "questions"), questionData);
        }

      }

      toast({
        title: "Quiz Created!",
        description: "Your new quiz has been saved successfully.",
      });
      router.push("/dashboard/quizzes");
    } catch (error) {
      console.error("Error creating quiz:", error);
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "Could not save the quiz. Please try again.",
      });
    } finally {
        setIsSubmitting(false);
    }
  }


  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Create a New Quiz</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Quiz Details</CardTitle>
              <CardDescription>
                Start by giving your quiz a title and assigning it to the right classes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quiz Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Chapter 5: Cell Biology" {...field} />
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
                      <Textarea placeholder="A brief summary of what this quiz covers." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="classIds"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">Assign to Classes</FormLabel>
                      <FormDescription>
                        Select the classes you want to assign this quiz to. This will apply to both AI-generated and manually created quizzes.
                      </FormDescription>
                    </div>
                    {classesLoading ? <p>Loading classes...</p> :
                      teacherClasses && teacherClasses.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                          {teacherClasses.map((item) => (
                            <FormField
                              key={item.id}
                              control={form.control}
                              name="classIds"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={item.id}
                                    className="flex flex-row items-start space-x-3 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(item.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), item.id])
                                            : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== item.id
                                              )
                                            )
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                      {item.name}
                                    </FormLabel>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-6 min-h-[100px] border-2 border-dashed rounded-lg bg-secondary/50">
                          <BookCopy className="h-8 w-8 text-muted-foreground mb-2" />
                          <h3 className="text-sm font-semibold">No Classes Found</h3>
                          <p className="text-xs text-muted-foreground">
                            You need to create a class before you can assign a quiz.
                          </p>
                        </div>
                      )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-lg mx-auto">
              <TabsTrigger value="ai">
                <Bot className="mr-2 h-4 w-4" />
                Add Questions with AI
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Pencil className="mr-2 h-4 w-4" />
                Add Questions Manually
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ai">
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>AI-Powered Question Generation</CardTitle>
                  <CardDescription>
                    Let our AI create questions for your quiz. Just provide a topic and the number of questions. The generated questions will be added to the form for your review.
                  </CardDescription>
                </CardHeader>
                <Form {...aiForm}>
                  <div className="space-y-6">
                    <CardContent className="space-y-6">
                      <FormField
                        control={aiForm.control}
                        name="topic"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quiz Topic</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., The Renaissance, Photosynthesis, WW2" {...field} />
                            </FormControl>
                            <FormDescription>What subject should the questions be about?</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={aiForm.control}
                        name="numQuestions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of Questions</FormLabel>
                            <FormControl>
                              <Input type="number" min="1" max="10" {...field} />
                            </FormControl>
                            <FormDescription>How many questions should the AI generate? (1-10)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                    <CardFooter>
                      <Button type="button" onClick={aiForm.handleSubmit(handleAiSubmit)} disabled={isGenerating}>
                        {isGenerating && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
                        Generate Questions
                      </Button>
                    </CardFooter>
                  </div>
                </Form>
              </Card>
            </TabsContent>
            <TabsContent value="manual">
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Manual Question Builder</CardTitle>
                  <CardDescription>
                    {form.formState.isDirty ? 'Review your AI-generated questions or build them from scratch.' : 'Craft your questions one by one. You have full control over the content.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    {fields.map((field, index) => {
                      const questionType = form.watch(`questions.${index}.type`);
                      return (
                        <Card key={field.id} className="mb-4 bg-secondary/50">
                          <CardHeader className="flex flex-row items-center justify-between pb-4">
                            <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <FormField
                              control={form.control}
                              name={`questions.${index}.type`}
                              render={({ field: typeField }) => (
                                <FormItem>
                                  <FormLabel>Question Type</FormLabel>
                                  <Select onValueChange={(value) => {
                                    const currentQuestion = form.getValues(`questions.${index}`);
                                    const newQuestionDefaults = {
                                      mcq: { correctAnswer: "", options: [{ text: "" }, { text: "" }] },
                                      true_false: { correctAnswer: "true", options: [] },
                                      short_answer: { correctAnswer: "", options: [] },
                                    };
                                    const defaults = newQuestionDefaults[value as keyof typeof newQuestionDefaults];

                                    const newQuestion = {
                                      text: currentQuestion.text,
                                      type: value as "mcq" | "true_false" | "short_answer",
                                      ...defaults,
                                    };

                                    update(index, newQuestion);

                                  }} defaultValue={typeField.value}>
                                    <FormControl>
                                      <SelectTrigger><SelectValue placeholder="Select a question type" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="mcq">Multiple Choice</SelectItem>
                                      <SelectItem value="true_false">True/False</SelectItem>
                                      <SelectItem value="short_answer">Short Answer</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`questions.${index}.text`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Question Text</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="What is the powerhouse of the cell?" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {questionType === 'mcq' && (
                              <MCQFields control={form.control} questionIndex={index} />
                            )}
                            {questionType === 'true_false' && (
                              <TrueFalseFields control={form.control} questionIndex={index} />
                            )}
                            {questionType === 'short_answer' && (
                              <ShortAnswerFields control={form.control} questionIndex={index} />
                            )}

                          </CardContent>
                        </Card>
                      )
                    })}
                    <FormMessage>{form.formState.errors.questions?.root?.message}</FormMessage>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button type="button" variant="outline" onClick={() => addQuestion('mcq')}><Plus className="mr-2 h-4 w-4" /> Multiple Choice</Button>
                    <Button type="button" variant="outline" onClick={() => addQuestion('true_false')}><Plus className="mr-2 h-4 w-4" /> True/False</Button>
                    <Button type="button" variant="outline" onClick={() => addQuestion('short_answer')}><Plus className="mr-2 h-4 w-4" /> Short Answer</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
              Save Quiz
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}


// Sub-components for different question types to keep the main component clean

function MCQFields({ control, questionIndex }: { control: any, questionIndex: number }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `questions.${questionIndex}.options`,
  });
  
  const options = useWatch({
    control,
    name: `questions.${questionIndex}.options`,
  });

  return (
    <div className="space-y-4">
      <FormLabel>Options</FormLabel>
      <FormDescription>Select the correct answer by clicking the radio button.</FormDescription>
      <Controller
        name={`questions.${questionIndex}.correctAnswer`}
        control={control}
        render={({ field }) => (
          <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-2">
            {fields.map((option, optionIndex) => (
              <div key={option.id} className="flex items-center gap-2">
                <FormControl>
                    <RadioGroupItem value={options?.[optionIndex]?.text || ''} />
                </FormControl>
                <FormField
                  control={control}
                  name={`questions.${questionIndex}.options.${optionIndex}.text`}
                  render={({ field: optionField }) => (
                    <FormItem className="flex-grow">
                      <FormControl>
                        <Input placeholder={`Option ${optionIndex + 1}`} {...optionField} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(optionIndex)} disabled={fields.length <= 2}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
             <FormMessage>{control.getFieldState(`questions.${questionIndex}.options`).error?.root?.message}</FormMessage>
             <FormMessage>{control.getFieldState(`questions.${questionIndex}.correctAnswer`).error?.message}</FormMessage>
          </RadioGroup>
        )}
      />
      
      <Button type="button" variant="outline" size="sm" onClick={() => append({ text: "" })}>
        <Plus className="mr-2 h-4 w-4" />
        Add Option
      </Button>
    </div>
  );
}

function TrueFalseFields({ control, questionIndex }: { control: any, questionIndex: number }) {
    return (
        <div className="space-y-2">
             <FormField
                control={control}
                name={`questions.${questionIndex}.correctAnswer`}
                render={({ field }) => (
                <FormItem className="space-y-3">
                    <FormLabel>Correct Answer</FormLabel>
                    <FormControl>
                    <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                        className="flex space-x-4"
                    >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                            <RadioGroupItem value="true" id={`q${questionIndex}-true`} />
                        </FormControl>
                        <FormLabel className="font-normal" htmlFor={`q${questionIndex}-true`}>True</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                            <RadioGroupItem value="false" id={`q${questionIndex}-false`} />
                        </FormControl>
                        <FormLabel className="font-normal" htmlFor={`q${questionIndex}-false`}>False</FormLabel>
                        </FormItem>
                    </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>
    )
}

function ShortAnswerFields({ control, questionIndex }: { control: any, questionIndex: number }) {
    return (
        <div className="space-y-2">
            <FormField
                control={control}
                name={`questions.${questionIndex}.correctAnswer`}
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Correct Answer</FormLabel>
                    <FormDescription>The student's answer must match this text exactly (case-insensitive).</FormDescription>
                    <FormControl>
                        <Input placeholder="Enter the exact correct answer" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>
    )
}
