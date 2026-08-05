'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';

// JOEY UPDATE: Created dynamic services inquiry form with step-based flow
// Form adapts based on user's selected service type (Buy, Sell, Both, General)

interface ServicesInquiryFormProps {
  isOpen: boolean;
  onClose: () => void;
}

type ServiceType = 'buying' | 'selling' | 'both' | 'general' | null;

export function ServicesInquiryForm({ isOpen, onClose }: ServicesInquiryFormProps) {
  const [step, setStep] = React.useState<'service' | 'details'>('service');
  const [serviceType, setServiceType] = React.useState<ServiceType>(null);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    phone: '',
    timeline: '',
    budget: '',
    message: '',
  });

  // JOEY UPDATE: Reset form when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('service');
        setServiceType(null);
        setFormData({
          name: '',
          email: '',
          phone: '',
          timeline: '',
          budget: '',
          message: '',
        });
      }, 300);
    }
  }, [isOpen]);

  // JOEY UPDATE: Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleServiceSelect = (type: ServiceType) => {
    setServiceType(type);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // JOEY UPDATE: Add form submission logic here (API call to /api/leads)
    console.log('Form submitted:', { serviceType, ...formData });
    // Show success message and close modal
    alert('Thank you! Joey will be in touch soon.');
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* JOEY UPDATE: Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* JOEY UPDATE: Modal container - centered on desktop, drawer on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-2xl -translate-y-1/2 overflow-hidden rounded-lg bg-white shadow-2xl sm:inset-x-auto sm:w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Close modal"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal content */}
            <div className="max-h-[85vh] overflow-y-auto p-8 sm:p-12">
              {step === 'service' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2 id="modal-title" className="font-serif text-3xl text-navy sm:text-4xl">
                    How Can I Help You?
                  </h2>
                  <p className="mt-4 font-sans text-lg text-stone">
                    Select the service you're interested in to get started.
                  </p>

                  {/* JOEY UPDATE: Service type selection cards */}
                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <button
                      onClick={() => handleServiceSelect('buying')}
                      className="group flex flex-col items-start rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-all hover:border-champagne hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
                    >
                      <svg className="h-8 w-8 text-neutral-400 transition-colors group-hover:text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <h3 className="mt-4 font-serif text-xl text-navy">Buying a Home</h3>
                      <p className="mt-2 font-sans text-sm text-stone">Find your perfect property in Atlanta</p>
                    </button>

                    <button
                      onClick={() => handleServiceSelect('selling')}
                      className="group flex flex-col items-start rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-all hover:border-champagne hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
                    >
                      <svg className="h-8 w-8 text-neutral-400 transition-colors group-hover:text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                      </svg>
                      <h3 className="mt-4 font-serif text-xl text-navy">Selling a Home</h3>
                      <p className="mt-2 font-sans text-sm text-stone">Get top dollar for your property</p>
                    </button>

                    <button
                      onClick={() => handleServiceSelect('both')}
                      className="group flex flex-col items-start rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-all hover:border-champagne hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
                    >
                      <svg className="h-8 w-8 text-neutral-400 transition-colors group-hover:text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                      <h3 className="mt-4 font-serif text-xl text-navy">Buying & Selling</h3>
                      <p className="mt-2 font-sans text-sm text-stone">Seamless transition to your next home</p>
                    </button>

                    <button
                      onClick={() => handleServiceSelect('general')}
                      className="group flex flex-col items-start rounded-lg border-2 border-neutral-200 bg-white p-6 text-left transition-all hover:border-champagne hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
                    >
                      <svg className="h-8 w-8 text-neutral-400 transition-colors group-hover:text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                      <h3 className="mt-4 font-serif text-xl text-navy">General Question</h3>
                      <p className="mt-2 font-sans text-sm text-stone">Ask me anything about real estate</p>
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 'details' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Back button */}
                  <button
                    onClick={() => setStep('service')}
                    className="mb-6 flex items-center gap-2 font-sans text-sm text-stone transition-colors hover:text-navy"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>

                  <h2 className="font-serif text-3xl text-navy sm:text-4xl">
                    Tell Me About Your Goals
                  </h2>
                  <p className="mt-4 font-sans text-lg text-stone">
                    {serviceType === 'buying' && "Let's find your perfect home in Atlanta."}
                    {serviceType === 'selling' && "Let's get your home sold for top dollar."}
                    {serviceType === 'both' && "Let's make your transition seamless."}
                    {serviceType === 'general' && "I'm here to help with any questions."}
                  </p>

                  {/* JOEY UPDATE: Dynamic form fields based on service type */}
                  <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="name">Full Name *</Label>
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="John Smith"
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="(555) 123-4567"
                          className="mt-2"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="john@example.com"
                        className="mt-2"
                      />
                    </div>

                    {(serviceType === 'buying' || serviceType === 'both') && (
                      <>
                        <div>
                          <Label htmlFor="budget">Budget Range</Label>
                          <Input
                            id="budget"
                            name="budget"
                            type="text"
                            value={formData.budget}
                            onChange={handleChange}
                            placeholder="$500K - $750K"
                            className="mt-2"
                          />
                        </div>

                        <div>
                          <Label htmlFor="timeline">When are you looking to buy?</Label>
                          <Input
                            id="timeline"
                            name="timeline"
                            type="text"
                            value={formData.timeline}
                            onChange={handleChange}
                            placeholder="Within 3 months"
                            className="mt-2"
                          />
                        </div>
                      </>
                    )}

                    {(serviceType === 'selling' || serviceType === 'both') && (
                      <div>
                        <Label htmlFor="timeline">When are you looking to sell?</Label>
                        <Input
                          id="timeline"
                          name="timeline"
                          type="text"
                          value={formData.timeline}
                          onChange={handleChange}
                          placeholder="Within 6 months"
                          className="mt-2"
                        />
                      </div>
                    )}

                    <div>
                      <Label htmlFor="message">Additional Details</Label>
                      <Textarea
                        id="message"
                        name="message"
                        rows={4}
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Tell me more about what you're looking for..."
                        className="mt-2"
                      />
                    </div>

                    <div className="flex gap-4">
                      <Button type="submit" variant="primary" size="lg" className="flex-1">
                        Send Message
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Made with Bob