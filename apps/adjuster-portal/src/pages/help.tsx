import { useState } from 'react';
import {
  Book,
  MessageSquare,
  Video,
  FileText,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Clock,
  Mail,
  LifeBuoy,
  ChevronDown,
} from 'lucide-react';
import { Header } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';

export function HelpPage() {
  const faqs = [
    {
      question: 'How do I start a video assessment?',
      answer: (
        <>
          Navigate to the <strong>Schedule</strong> tab, find your upcoming session, and click{' '}
          <strong>Join</strong>. Ensure your camera and microphone permissions are enabled in your
          browser.
        </>
      ),
    },
    {
      question: 'How long does the AI analysis take?',
      answer: (
        <>
          Typically, the AI performs continuous, real-time analysis throughout the video as the
          content is being processed.
        </>
      ),
    },
    {
      question: 'Can I upload my own video for analysis?',
      answer: (
        <>
          Yes, you can upload your own video. To do this, navigate to the <strong>Claim</strong>{' '}
          detail page by clicking the <strong>Manual Upload</strong> button, and then follow the
          prompts to upload your video for analysis.
        </>
      ),
    },
    {
      question: 'What video formats are supported for upload?',
      answer: (
        <>
          We support MP4, MOV, and AVI formats. Files should be under 500MB for optimal processing
          speed.
        </>
      ),
    },
    {
      question: 'Can I download my reports as a PDF?',
      answer: (
        <>
          Yes, you can download reports from the <strong>Claim</strong> detail page by clicking the{' '}
          download icon on the right side of the file.
        </>
      ),
    },
  ];

  const categories = [
    { name: 'Getting Started', icon: Book, count: 12 },
    { name: 'Video Assessments', icon: Video, count: 8 },
    { name: 'Claims Management', icon: FileText, count: 15 },
    { name: 'AI Insights', icon: LifeBuoy, count: 6 },
  ];

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50">
      <Header
        title="Help"
        description="Find answers, explore tutorials, or contact our support team"
      >
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search for help articles..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Knowledge Base Categories */}
              {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {categories.map(category => (
                  <Card
                    key={category.name}
                    className="border-border/60 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <category.icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-xs text-muted-foreground">{category.count} articles</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div> */}

              {/* FAQs */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2 pb-3">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Frequently Asked Questions
                </h2>
                <div className="space-y-4">
                  {faqs.map((faq, index) => {
                    const isExpanded = expandedIndex === index;
                    return (
                      <Card key={index} className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader
                          className="py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                          onClick={() => toggleFAQ(index)}
                        >
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold">
                              {faq.question}
                            </CardTitle>
                            <ChevronDown
                              className={cn(
                                'h-5 w-5 text-muted-foreground transition-transform duration-200',
                                isExpanded && 'rotate-180'
                              )}
                            />
                          </div>
                        </CardHeader>
                        <div
                          className={cn(
                            'grid transition-all duration-200 ease-in-out',
                            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                          )}
                        >
                          <div className="overflow-hidden">
                            <CardContent className="pb-4 pt-0">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {faq.answer}
                              </p>
                            </CardContent>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Contact Support */}
            <div className="space-y-6">
              <Card className="border-primary/20 bg-primary/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Live Support
                  </CardTitle>
                  <CardDescription>Need immediate assistance?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      Average wait time: <b>&lt; 2 minutes</b>
                    </span>
                  </div>
                  <Button className="w-full shadow-lg shadow-primary/20">Start Chat</Button>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Contact Us</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Email Support</p>
                      <p className="text-xs text-muted-foreground">support@trueclaim.com</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Support Hours</p>
                      <p className="text-xs text-muted-foreground">Mon-Fri, 8am - 5pm GMT</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* <Card className="border-border/60 shadow-sm overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                <CardHeader>
                  <CardTitle className="text-lg">Resource Center</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors border-b border-border/50">
                    <span className="text-sm font-medium">Video Tutorials</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors border-b border-border/50">
                    <span className="text-sm font-medium">User Manual (PDF)</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                    <span className="text-sm font-medium">API Documentation</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CardContent>
              </Card> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
