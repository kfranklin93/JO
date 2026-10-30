'use client';

import * as React from 'react';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { ServicesInquiryForm } from '@/components/forms/ServicesInquiryForm';

/**
 * The contact page's route into `ServicesInquiryForm`.
 *
 * That form used to have exactly one way in: `FloatingConnectCTA`, the floating
 * button that sat opposite the chat launcher on every marketing page. Retiring
 * the button would have orphaned the form, so this is where it lives now — the
 * contact page, which is the page a visitor who wants to write rather than chat
 * is already on.
 *
 * It is a separate component, and a client one, because the contact page is a
 * server component that exports `metadata`. The modal needs open/closed state;
 * putting it here keeps that state out of the page.
 *
 * ## Why keep it at all, when /get-started also captures a lead
 *
 * The two forms ask different questions. `/get-started` runs
 * `LeadCaptureForm`, which collects property criteria. This one opens on a
 * picker — buying, selling, both, or a general question — and then asks for
 * timeline and budget. A seller or someone with a question that is not a
 * property search gets a shorter path through this one.
 *
 * `outline` is the light-surface variant (navy border, navy label). It is
 * correct here and would be invisible on a dark section — see the variant note
 * in MagneticButton.
 */
export function ServicesInquiryLauncher() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <MagneticButton variant="outline" size="lg" onClick={() => setIsOpen(true)}>
        <span>Tell Joey What You Need</span>
      </MagneticButton>

      <ServicesInquiryForm isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
