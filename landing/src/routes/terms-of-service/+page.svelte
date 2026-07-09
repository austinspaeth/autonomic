<script lang="ts">
  import { site } from '$lib/site';
  const canonical = `${site.url}/terms-of-service/`;
</script>

<svelte:head>
  <title>Terms of Service — Autonomic</title>
  <meta
    name="description"
    content="Autonomic's terms of service. Autonomic is an educational logging tool — not a medical device — and does not diagnose, treat, or provide medical advice."
  />
  <link rel="canonical" href={canonical} />
</svelte:head>

<section class="legal">
  <div class="wrap legal-wrap">
    <p class="eyebrow">Legal</p>
    <h1 class="h2">Terms of Service</h1>
    <p class="legal-updated">Last updated: July 9, 2026</p>

    <div class="article-prose">
      <p>
        These Terms of Service ("Terms") govern your use of the Autonomic mobile application and
        this website (together, "Autonomic"). By downloading, installing, or using Autonomic, you
        agree to these Terms. If you do not agree, do not use Autonomic.
      </p>

      <h2>1. What Autonomic is — and is not</h2>
      <p>
        Autonomic is a <strong>personal logging and educational tool</strong>. It lets you record
        health-related observations — heart-rate variability, sleep, symptoms, medications,
        activities, and similar entries — and view charts, scores, and summaries of what you
        logged. It is provided <strong>for educational and informational purposes only</strong>.
      </p>
      <p>
        <strong>Autonomic is not a medical device.</strong> It has not been evaluated, cleared, or
        approved by the FDA or any other regulatory body. Autonomic does not — and is not intended
        to — <strong>diagnose, treat, cure, mitigate, or prevent any disease or condition</strong>,
        and nothing in the app or on this site constitutes medical advice, a medical opinion, or a
        clinical assessment of any kind.
      </p>

      <h2>2. Talk to your doctor</h2>
      <p>
        Always consult a qualified healthcare professional before starting, stopping, or changing
        any medication, supplement, exercise program, diet, or treatment — including anything you
        decide to try after looking at your own logged data. Never disregard, or delay seeking,
        professional medical advice because of something displayed in Autonomic.
      </p>
      <p>
        <strong>If you think you are experiencing a medical emergency, call your local emergency
        number immediately.</strong> Autonomic is not designed for emergency detection, monitoring,
        or response.
      </p>

      <h2>3. Scores, thresholds, and charts</h2>
      <p>
        The scores, grades, zones, and reference ranges shown in Autonomic are simplified,
        general-population heuristics applied to data you entered. They may be wrong for you, and
        readings from consumer sensors (chest straps, watches, cuffs) can be inaccurate or
        incomplete. They are conversation starters for you and your clinician — not clinical
        measurements or conclusions.
      </p>

      <h2>4. AI-generated content</h2>
      <p>
        Autonomic can assemble your logged data into prompts you may paste into third-party AI
        services (such as Claude, ChatGPT, or Gemini). Any analysis, interpretation, or suggestion
        produced by those services <strong>comes from that service, not from Autonomic</strong>. We
        do not control, endorse, or verify AI output, which can be inaccurate or inappropriate for
        your situation. Your use of any AI service is governed by that provider's own terms, and
        anything it tells you is subject to Section 2 above: discuss it with your doctor first.
      </p>

      <h2>5. Your data and your responsibilities</h2>
      <p>
        All data you enter stays on your device (see our
        <a href="/privacy-policy/">Privacy Policy</a>). You are responsible for the accuracy of what
        you log, for safeguarding your device, and for maintaining your own exports or backups. We
        are not responsible for data loss resulting from device failure, deletion, reinstallation,
        or failure to keep backups.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        You may use Autonomic only for lawful, personal, non-commercial purposes. You may not
        reverse-engineer, resell, or misrepresent Autonomic, or use it as a substitute for
        professional medical care for yourself or others.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Autonomic, including its design, code, text, and branding, is owned by its developer and
        protected by applicable intellectual-property laws. The data you log is yours.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        AUTONOMIC IS PROVIDED <strong>"AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY
        KIND</strong>, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT
        WARRANT THAT AUTONOMIC WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY SCORE, CHART, OR
        CALCULATION IS ACCURATE OR SUITABLE FOR YOUR CIRCUMSTANCES.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DEVELOPER OF AUTONOMIC SHALL NOT BE LIABLE FOR
        ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES — INCLUDING PERSONAL
        INJURY, HEALTH OUTCOMES, LOST DATA, OR LOST PROFITS — ARISING OUT OF OR RELATING TO YOUR USE
        OF, OR INABILITY TO USE, AUTONOMIC, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN
        NO EVENT SHALL TOTAL AGGREGATE LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE APP IN THE
        TWELVE MONTHS PRECEDING THE CLAIM. YOU USE AUTONOMIC AT YOUR OWN RISK, AND DECISIONS YOU
        MAKE BASED ON LOGGED DATA OR AI OUTPUT ARE YOURS ALONE.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless the developer of Autonomic from claims arising out
        of your misuse of the app, your violation of these Terms, or your reliance on the app in
        place of professional medical care.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update Autonomic and these Terms from time to time. Material changes will be
        reflected on this page with a new "last updated" date; continued use after changes
        constitutes acceptance.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the United States and of the developer's state of
        residence, without regard to conflict-of-law rules. If any provision is found
        unenforceable, the remainder stays in effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms can be raised through the app's App Store listing or the
        channels on this site.
      </p>
    </div>
  </div>
</section>

<style>
  .legal { padding: 150px 0 100px; }
  .legal-wrap { max-width: 780px; }
  .legal-updated {
    color: var(--dim-2);
    font-family: var(--mono);
    font-size: 13px;
    margin: 0 0 40px;
  }
</style>
