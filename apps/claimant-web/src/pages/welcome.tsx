import { Link } from 'react-router-dom';
import { CheckCircle2, Video, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: CheckCircle2,
    title: 'Secure Verification',
    description: 'Quick identity verification with your NRIC',
  },
  {
    icon: Video,
    title: 'Video Assessment',
    description: 'Connect with adjusters via secure video call',
  },
  {
    icon: FileText,
    title: 'Digital Signing',
    description: 'Sign documents electronically from your phone',
  },
];

export function WelcomePage() {
  return (
    <div className="flex flex-col flex-1 bg-background px-14">
      {/* Header */}
      <header className="py-4">
        <div className="flex justify-center mt-8">
          <div className="bg-card p-4 rounded-3xl shadow-xl shadow-primary/10 border border-border transition-transform hover:scale-105 duration-300">
            <img src="/logo.png" alt="Logo" className="w-14 h-14" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-center py-8">
        <div className="space-y-6">
          <div className="space-y-3 flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-primary">Assessments Made Simple</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Securely access your insurance assessment from your phone. Fast, digital, and
              professional.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6 py-6">
            {features.map(feature => (
              <div key={feature.title} className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* CTA */}
      <footer className="space-y-4">
        <Link to="/login" className="block">
          <Button
            type="submit"
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
          >
            Start
          </Button>
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <a href="#" className="text-primary underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-primary underline">
            Privacy Policy
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
