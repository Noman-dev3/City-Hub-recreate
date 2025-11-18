
'use client';

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Video, PenSquare, MessagesSquare, CheckSquare } from "lucide-react";
import { useUser } from "@/firebase";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const heroImage = PlaceHolderImages.find(p => p.id === 'hero-classroom');
  const { user, loading } = useUser();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="container mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Icons.Logo className="h-7 w-7 text-primary" />
          <span className="font-headline">City School Hub</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          {loading ? (
            <>
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-24" />
            </>
          ) : user ? (
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Log In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="flex-grow">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-6xl font-bold font-headline tracking-tight mb-6">
              The Future of Learning,
              <br />
              <span className="text-primary">Connected.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground mb-10">
              Engage in live classes, collaborate with peers, and access all your course materials in one seamless platform.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/signup">Get Started for Free</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="relative rounded-xl overflow-hidden shadow-2xl aspect-video max-w-5xl mx-auto">
            {heroImage && (
              <Image
                src={heroImage.imageUrl}
                alt={heroImage.description}
                fill
                className="object-cover"
                data-ai-hint={heroImage.imageHint}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
          </div>
        </section>
        
        <section className="py-20 md:py-32 bg-card/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold font-headline">Everything You Need to Succeed</h2>
              <p className="max-w-xl mx-auto text-muted-foreground mt-4">
                Our platform is designed to provide a rich, interactive learning experience for both students and teachers.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                icon={<Video className="h-8 w-8 text-primary" />}
                title="Live Video Classes"
                description="Join real-time video classrooms with crystal-clear audio and video."
              />
              <FeatureCard
                icon={<PenSquare className="h-8 w-8 text-primary" />}
                title="Interactive Quizzes"
                description="Take quizzes and get instant feedback to track your progress."
              />
              <FeatureCard
                icon={<MessagesSquare className="h-8 w-8 text-primary" />}
                title="Real-time Chat"
                description="Collaborate with classmates and ask questions with our integrated chat."
              />
              <FeatureCard
                icon={<CheckSquare className="h-8 w-8 text-primary" />}
                title="Manageable Coursework"
                description="Teachers can easily upload files, create assignments, and manage classes."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 bg-card/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} City School Hub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string; }) {
  return (
    <Card className="text-center bg-background shadow-lg border-t-4 border-primary/20 hover:border-primary transition-colors duration-300">
      <CardHeader>
        <div className="mx-auto bg-primary/10 rounded-full p-4 w-fit">
          {icon}
        </div>
        <CardTitle className="pt-4 font-headline">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
