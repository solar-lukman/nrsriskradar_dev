import React, { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Search, ExternalLink, Mail, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SeoHead } from '@/components/SeoHead';

const faqData = [
  {
    id: 'risk-register-1',
    category: 'Risk Register',
    question: 'How do I create a new risk entry?',
    answer: 'Navigate to the Risk Register page and click the "Add Risk" button. Fill in the required fields including title, description, category, and risk scores.',
    docs: '/docs/risk-register#creating-risks'
  },
  {
    id: 'risk-register-2',
    category: 'Risk Register',
    question: 'What are the different risk statuses?',
    answer: 'Risk statuses include: New (newly identified), In Review (being assessed), Mitigated (controls implemented), and Escalated (requires senior attention).',
    docs: '/docs/risk-register#risk-statuses'
  },
  {
    id: 'matrix-1',
    category: 'Matrix',
    question: 'How is the risk score calculated?',
    answer: 'Risk score is calculated by multiplying Likelihood × Impact. Both are rated on a scale of 1-5, giving scores from 1 (very low) to 25 (very high).',
    docs: '/docs/risk-matrix#scoring'
  },
  {
    id: 'matrix-2',
    category: 'Matrix',
    question: 'What do the different color zones mean?',
    answer: 'Green (1-6): Low risk, Yellow (8-12): Medium risk, Red (15-25): High risk. These zones help prioritize risk management efforts.',
    docs: '/docs/risk-matrix#color-zones'
  },
  {
    id: 'dashboard-1',
    category: 'Dashboard',
    question: 'How often is dashboard data updated?',
    answer: 'Dashboard data is updated in real-time when risks are modified. Charts and metrics refresh automatically every 5 minutes.',
    docs: '/docs/dashboard#data-refresh'
  },
  {
    id: 'dashboard-2',
    category: 'Dashboard',
    question: 'Can I export dashboard reports?',
    answer: 'Yes, use the Export menu to generate PDF reports or Excel spreadsheets. Reports can be filtered by date range, department, or risk category.',
    docs: '/docs/dashboard#exporting'
  },
  {
    id: 'bcp-1',
    category: 'BCP',
    question: 'What is a Business Continuity Plan?',
    answer: 'A BCP outlines procedures to maintain critical business functions during and after a disruption. It includes recovery strategies, contact information, and testing schedules.',
    docs: '/docs/bcp#overview'
  },
  {
    id: 'bcp-2',
    category: 'BCP',
    question: 'How often should BCPs be tested?',
    answer: 'BCPs should be tested at least annually, with critical plans tested quarterly. The system tracks test dates and sends reminders when tests are due.',
    docs: '/docs/bcp#testing'
  },
  {
    id: 'forum-1',
    category: 'Forum',
    question: 'How do I start a new discussion?',
    answer: 'Go to the Learning Forum, select a category, and click "New Discussion". Provide a clear title and detailed description of your topic.',
    docs: '/docs/forum#creating-discussions'
  },
  {
    id: 'forum-2',
    category: 'Forum',
    question: 'Can I attach files to forum posts?',
    answer: 'File attachments are not currently supported in forum posts. For document sharing, use the Control Documents section instead.',
    docs: '/docs/forum#limitations'
  }
];

const categories = ['All', 'Risk Register', 'Matrix', 'Dashboard', 'BCP', 'Forum'];

const FAQPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [contactForm, setContactForm] = useState({
    subject: '',
    message: '',
    email: ''
  });
  const { toast } = useToast();

  const filteredFAQs = faqData.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically send the contact form data to your backend
    toast({
      title: "Support Request Sent",
      description: "We'll get back to you within 24 hours.",
    });
    setContactForm({ subject: '', message: '', email: '' });
  };

  return (
    <MainLayout>
      <SeoHead
        title="Help Center & FAQ"
        description="Answers to frequently asked questions about the NRS Risk Management Portal — risk register, matrix, dashboards, business continuity, and the learning forum."
        path="/help"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqData.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }}
      />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Help Center & FAQ</h1>
            <p className="text-muted-foreground">Find answers to common questions and get support</p>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search frequently asked questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant={selectedCategory === category ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FAQ Section */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="sr-only">Frequently Asked Questions</h2>
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
                <CardDescription>
                  {filteredFAQs.length} question(s) found
                  {selectedCategory !== 'All' && ` in ${selectedCategory}`}
                  {searchTerm && ` matching "${searchTerm}"`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredFAQs.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFAQs.map((faq) => (
                      <AccordionItem key={faq.id} value={faq.id}>
                        <AccordionTrigger className="text-left">
                          <div className="flex items-start space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {faq.category}
                            </Badge>
                            <span>{faq.question}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            <p className="text-muted-foreground">{faq.answer}</p>
                            <Button variant="outline" size="sm" asChild>
                              <a href={faq.docs} className="inline-flex items-center space-x-2">
                                <ExternalLink className="w-3 h-3" />
                                <span>View Documentation</span>
                              </a>
                            </Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      No questions found matching your search criteria.
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedCategory('All');
                      }}
                      className="mt-4"
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Contact Form Sidebar */}
          <div className="space-y-6">
            <h2 className="sr-only">Contact Support</h2>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Mail className="w-5 h-5" />
                  <span>Contact Support</span>
                </CardTitle>
                <CardDescription>
                  Can't find what you're looking for? Send us a message.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="your.email@company.com"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={contactForm.subject}
                      onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Brief description of your issue"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={contactForm.message}
                      onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Describe your question or issue in detail..."
                      rows={4}
                      required
                    />
                  </div>
                  
                  <Button type="submit" className="w-full">
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-between" asChild>
                  <a href="/app">
                    Dashboard
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-between" asChild>
                  <a href="/risk-register">
                    Risk Register
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-between" asChild>
                  <a href="/business-continuity">
                    Business Continuity
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-between" asChild>
                  <a href="/control-documents">
                    Control Documents
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default FAQPage;