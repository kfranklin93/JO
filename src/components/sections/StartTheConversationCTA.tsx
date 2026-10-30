'use client';

import * as React from 'react';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { openJoeyChat } from '@/lib/chat/open-chat';

/**
 * The closing step on each service page.
 *
 * Every one of these pages used to be a stub with nothing to do at the bottom.
 * The strongest action available is the chat assistant: it answers from Joey's
 * own approved playbook, qualifies the visitor, and can hand back a booking
 * link — so the primary button opens the panel that the marketing layout has
 * already mounted rather than sending the visitor off to a form.
 *
 * The form is still the secondary action. Some people will not type into a chat
 * box, and `/get-started` captures the same lead without one.
 *
 * ## Colours
 *
 * Hunter surface, which makes a hunter action invisible — `primary` is hunter.
 * Hence `champagne` (gold fill, onyx label) for the action to press and
 * `onDark` (bone outline) for the alternative; gold beside gold would compete.
 * Text is bone, never white, which is the rule for every dark brand surface.
 */
export interface StartTheConversationCTAProps {
  /** Section heading. Rendered as an `<h2>`, so pages keep one `<h1>`. */
  heading: string;
  /** One or two sentences saying what happens next. */
  body: string;
  /** Label for the chat button. Name the thing the visitor gets. */
  chatLabel: string;
}

export function StartTheConversationCTA({
  heading,
  body,
  chatLabel,
}: StartTheConversationCTAProps) {
  return (
    <section className="bg-hunter py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-8 text-center lg:px-12">
        <h2 className="font-serif text-4xl font-light text-bone lg:text-5xl">
          {heading}
        </h2>
        <p className="mt-6 font-sans text-lg font-light leading-relaxed text-bone">
          {body}
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
          <MagneticButton variant="champagne" size="lg" onClick={openJoeyChat}>
            <span>{chatLabel}</span>
          </MagneticButton>
          <MagneticButton href="/get-started" variant="onDark" size="lg">
            <span>Send Your Details</span>
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
