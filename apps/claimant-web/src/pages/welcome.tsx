import { Link } from 'react-router-dom';
import { CheckCircle2, Video, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: CheckCircle2,
    title: 'Secure Verification',
    description: 'Quick identity verification with your NRIC and selfie',
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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-6 py-4">
        <div className="flex justify-center mb-8">
          <div className="bg-white p-4 rounded-3xl shadow-xl shadow-primary/10 border border-primary/10 transition-transform hover:scale-105 duration-300">
            <img src="/logo.png" alt="Logo" className="w-12 h-12" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-center px-6 py-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-primary">Assessments Made Simple</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Securely access your motor insurance assessment from your phone. Fast, digital, and
              professional.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 py-6">
            {features.map(feature => (
              <div key={feature.title} className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* CTA */}
      <footer className="px-6 py-8 space-y-4">
        <Link to="/login" className="block">
          <Button
            type="submit"
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
          >
            Access Your Assessment
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
        <p className="text-center text-sm text-muted-foreground">
          Need to file a new case?{' '}
          <Link to="/login" className="text-primary font-medium">
            Verify identity
          </Link>
        </p>
      </footer>
    </div>
  );
}
