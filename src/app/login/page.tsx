import Link from 'next/link';
import Image from 'next/image';
import { LoginForm } from "@/components/auth/LoginForm";
import { Icons } from '@/components/icons';
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const authImage = PlaceHolderImages.find(p => p.id === 'auth-students');

  return (
    <div className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-2 relative">
      {/* Background Image for small screens */}
      {authImage && (
        <Image
          src={authImage.imageUrl}
          alt={authImage.description}
          fill
          className="object-cover lg:hidden"
          data-ai-hint={authImage.imageHint}
        />
      )}
       <div className="absolute inset-0 bg-black/50 lg:hidden" />


      {/* Left Column - Image for large screens */}
      <div className="relative hidden lg:flex flex-col items-center justify-center bg-muted text-center p-8">
        {authImage && (
             <Image
                src={authImage.imageUrl}
                alt={authImage.description}
                fill
                className="object-cover"
                data-ai-hint={authImage.imageHint}
              />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
        <div className="relative z-10 max-w-md">
            <h1 className="text-3xl font-bold font-headline text-white">Unlock Your Potential</h1>
            <p className="text-white/80 mt-4">
                Sign in to access your dashboard, connect with teachers, and continue your learning journey.
            </p>
        </div>
      </div>

      {/* Right Column - Form */}
      <div className="flex items-center justify-center p-4 z-10">
        <Card className="w-full max-w-md mx-auto shadow-none border-none lg:shadow-xl lg:border bg-transparent lg:bg-card text-card-foreground lg:text-card-foreground backdrop-blur-lg lg:backdrop-blur-none bg-white/10 lg:bg-white rounded-xl">
          <CardHeader className="text-center">
            <Link href="/" className="flex items-center justify-center gap-2 font-bold text-xl mb-4 text-white lg:text-current">
              <Icons.Logo className="h-7 w-7 text-primary" />
              <span className="font-headline">City School Hub</span>
            </Link>
            <CardTitle className="text-2xl font-headline text-white lg:text-current">Welcome Back</CardTitle>
            <CardDescription className="text-white/80 lg:text-muted-foreground">Sign in to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
          <CardFooter className="text-sm text-white/80 lg:text-muted-foreground justify-center">
            <p>Don't have an account?{' '}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Sign Up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
