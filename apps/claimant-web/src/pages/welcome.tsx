import { Link } from 'react-router-dom';
import { ShieldCheck, Video, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: ShieldCheck,
    title: 'Secure Verification',
    description: 'Quick identity verification with your IC and selfie',
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
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">TC</span>
          </div>
          <span className="font-semibold text-xl">True Claim</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-center px-6 py-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Insurance Claims
              <br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Submit and track your motor insurance claim from your phone. 
              No paperwork, no waiting.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 py-6">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* CTA */}
      <footer className="px-6 py-8 space-y-4">
        <Link to="/login" className="block">
          <Button size="lg" className="w-full text-lg h-14">
            Start Your Claim
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
        <p className="text-center text-sm text-muted-foreground">
          Already have a claim?{' '}
          <Link to="/login" className="text-primary font-medium">
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  );
}
