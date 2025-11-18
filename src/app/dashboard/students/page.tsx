'use client';

import { useEffect, useState, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

type Student = {
    id: string;
    fullName: string;
    email: string;
    enrolledIn: string[]; // Array of class names
};

type ClassInfo = {
    id: string;
    name: string;
    studentIds: string[];
};

export default function StudentsPage() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore) return;

    const fetchStudents = async () => {
      setLoading(true);
      try {
        // 1. Find all classes taught by the current user
        const classesQuery = query(collection(firestore, 'classes'), where('teacherId', '==', user.uid));
        const classesSnapshot = await getDocs(classesQuery);
        const teachersClasses: ClassInfo[] = classesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClassInfo));
        
        if (teachersClasses.length === 0) {
            setStudents([]);
            setLoading(false);
            return;
        }

        // 2. Aggregate all unique student IDs from those classes
        const studentIdMap = new Map<string, string[]>(); // Map<studentId, className[]>
        teachersClasses.forEach(cls => {
            cls.studentIds.forEach(studentId => {
                if (!studentIdMap.has(studentId)) {
                    studentIdMap.set(studentId, []);
                }
                studentIdMap.get(studentId)?.push(cls.name);
            });
        });
        
        const uniqueStudentIds = Array.from(studentIdMap.keys());

        if (uniqueStudentIds.length === 0) {
            setStudents([]);
            setLoading(false);
            return;
        }

        // 3. Fetch the profile for each unique student
        const studentPromises = uniqueStudentIds.map(id => getDoc(doc(firestore, 'users', id)));
        const studentDocs = await Promise.all(studentPromises);

        const studentData = studentDocs
            .filter(doc => doc.exists())
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    fullName: data.fullName,
                    email: data.email,
                    enrolledIn: studentIdMap.get(doc.id) || [],
                } as Student;
            });
        
        setStudents(studentData);

      } catch (error) {
        console.error("Error fetching students:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [user, firestore]);

  const isLoading = userLoading || loading;


  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Manage Students</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
          <CardDescription>A list of all students enrolled in your classes.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
             </div>
          ) : students.length > 0 ? (
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[350px]">Student</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Enrolled In</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {students.map(student => (
                        <TableRow key={student.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarImage src={`https://avatar.vercel.sh/${student.email}.png`} alt={student.fullName} />
                                        <AvatarFallback>{student.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{student.fullName}</span>
                                </div>
                            </TableCell>
                            <TableCell>{student.email}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {student.enrolledIn.map(className => (
                                        <Badge key={className} variant="secondary">{className}</Badge>
                                    ))}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-10 min-h-[400px] border-2 border-dashed rounded-lg">
                <CardHeader>
                    <div className="mx-auto bg-secondary rounded-full p-6 w-fit mb-4">
                        <Users className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-2xl">No Students Enrolled</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground max-w-sm">
                        When students enroll in your classes, they will appear here.
                    </p>
                </CardContent>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
