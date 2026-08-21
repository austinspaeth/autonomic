# Custom EULA — App Store Connect

Paste the block below into **App Store Connect → your app → App Information →
License Agreement → Edit → Custom License Agreement**, and select **all
countries/regions** (the field is one text blob applied to every territory you
choose; there is no per-country variant to write).

Two things must be true before it goes in:

- Fill in `[LEGAL NAME]`, `[MAILING ADDRESS]` and `[PHONE]`. Apple's minimum
  terms require a real name, address and contact details for the developer;
  a placeholder is itself a rejection.
- Keep it in sync with `landing/src/routes/(site)/terms-of-service/+page.svelte`,
  which is the same agreement in web form and the URL the App Description links
  to. Sections 1-12 below are that page verbatim; sections 13 and 14 are the
  App Store additions (subscription billing, and Apple's required minimum
  terms) and have no web equivalent yet.

Note: a custom EULA is not a substitute for the link in the App Description.
Apple's automated metadata check rejected 1.25.1 for the missing description
link even though the app carries the terms in-app. Do both.

---

END USER LICENSE AGREEMENT — AUTONOMIC JOURNAL

Last updated: August 21, 2026

These Terms of Service ("Terms") govern your use of the Autonomic Journal mobile application and the autonomic.care website (together, "Autonomic"). By downloading, installing, or using Autonomic, you agree to these Terms. If you do not agree, do not use Autonomic. This agreement is between you and [LEGAL NAME] ("we", "us"), not with Apple Inc.

1. WHAT AUTONOMIC IS, AND IS NOT

Autonomic is a personal logging and educational tool. It lets you record health-related observations, heart-rate variability, sleep, symptoms, medications, activities, and similar entries, and view charts, scores, and summaries of what you logged. It is provided for educational and informational purposes only.

Autonomic is not a medical device. It has not been evaluated, cleared, or approved by the FDA or any other regulatory body. Autonomic does not, and is not intended to, diagnose, treat, cure, mitigate, or prevent any disease or condition, and nothing in the app or on the website constitutes medical advice, a medical opinion, or a clinical assessment of any kind.

2. TALK TO YOUR DOCTOR

Always consult a qualified healthcare professional before starting, stopping, or changing any medication, supplement, exercise program, diet, or treatment, including anything you decide to try after looking at your own logged data. Never disregard, or delay seeking, professional medical advice because of something displayed in Autonomic.

If you think you are experiencing a medical emergency, call your local emergency number immediately. Autonomic is not designed for emergency detection, monitoring, or response.

3. SCORES, THRESHOLDS, AND CHARTS

The scores, grades, zones, and reference ranges shown in Autonomic are simplified, general-population heuristics applied to data you entered. They may be wrong for you, and readings from consumer sensors (chest straps, watches, cuffs) can be inaccurate or incomplete. They are conversation starters for you and your clinician, not clinical measurements or conclusions.

4. AI-GENERATED CONTENT

Autonomic can assemble your logged data into prompts you may paste into third-party AI services (such as Claude, ChatGPT, or Gemini). Any analysis, interpretation, or suggestion produced by those services comes from that service, not from Autonomic. We do not control, endorse, or verify AI output, which can be inaccurate or inappropriate for your situation. Your use of any AI service is governed by that provider's own terms, and anything it tells you is subject to Section 2 above: discuss it with your doctor first.

5. YOUR DATA AND YOUR RESPONSIBILITIES

All data you enter stays on your device (see our Privacy Policy at https://autonomic.care/privacy-policy/). You are responsible for the accuracy of what you log, for safeguarding your device, and for maintaining your own exports or backups. We are not responsible for data loss resulting from device failure, deletion, reinstallation, or failure to keep backups.

6. ACCEPTABLE USE

You may use Autonomic only for lawful, personal, non-commercial purposes. You may not reverse-engineer, resell, or misrepresent Autonomic, or use it as a substitute for professional medical care for yourself or others.

7. INTELLECTUAL PROPERTY

Autonomic, including its design, code, text, and branding, is owned by its developer and protected by applicable intellectual-property laws. The data you log is yours.

8. DISCLAIMER OF WARRANTIES

AUTONOMIC IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT AUTONOMIC WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY SCORE, CHART, OR CALCULATION IS ACCURATE OR SUITABLE FOR YOUR CIRCUMSTANCES.

9. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DEVELOPER OF AUTONOMIC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING PERSONAL INJURY, HEALTH OUTCOMES, LOST DATA, OR LOST PROFITS, ARISING OUT OF OR RELATING TO YOUR USE OF, OR INABILITY TO USE, AUTONOMIC, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL TOTAL AGGREGATE LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE APP IN THE TWELVE MONTHS PRECEDING THE CLAIM. YOU USE AUTONOMIC AT YOUR OWN RISK, AND DECISIONS YOU MAKE BASED ON LOGGED DATA OR AI OUTPUT ARE YOURS ALONE.

10. INDEMNIFICATION

You agree to indemnify and hold harmless the developer of Autonomic from claims arising out of your misuse of the app, your violation of these Terms, or your reliance on the app in place of professional medical care.

11. CHANGES

We may update Autonomic and these Terms from time to time. Material changes will be reflected at https://autonomic.care/terms-of-service/ with a new "last updated" date; continued use after changes constitutes acceptance.

12. GOVERNING LAW

These Terms are governed by the laws of the State of South Carolina, United States, without regard to conflict-of-law rules. If any provision is found unenforceable, the remainder stays in effect.

13. SUBSCRIPTIONS AND BILLING

Autonomic is free to download and use. Core features stay free indefinitely. Autonomic Pro is an optional auto-renewable subscription that unlocks additional features.

Price and duration. Autonomic Pro is offered as a monthly subscription and a yearly subscription. The current price, duration and any promotional price are shown in the app before you purchase, in your local currency, and are the prices that apply.

Payment. Payment is charged to your Apple ID account at confirmation of purchase.

Auto-renewal. Your subscription renews automatically for the same period at the then-current price unless you cancel at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period.

Managing and cancelling. You can manage or cancel your subscription in your device's Settings under your Apple ID subscriptions, at any time. Cancelling stops the next renewal; it does not refund the period already paid for, and your Pro access continues until the end of that period.

Free trials and offers. Any free or discounted introductory period is granted once per Apple ID as determined by Apple. If you subscribe during a free trial, the unused portion of that trial is forfeited when you purchase.

Refunds. Purchases are processed by Apple, and refunds are handled by Apple under its own policies, not by us. Requests can be made at https://reportaproblem.apple.com.

Changes to pricing. We may change subscription prices. Where a change affects an existing subscription, Apple will notify you and, where required, ask you to consent before the change takes effect; if you do not consent, the subscription will not renew at the new price.

14. APPLE APP STORE TERMS

The following applies to the version of Autonomic obtained through the Apple App Store.

Acknowledgement. This agreement is concluded between you and [LEGAL NAME] only, and not with Apple. We, not Apple, are solely responsible for Autonomic and its content. This agreement may not provide for usage rules that conflict with the Apple Media Services Terms and Conditions, which take precedence if they conflict.

Scope of licence. We grant you a non-transferable licence to use Autonomic on any Apple-branded products that you own or control, as permitted by the Usage Rules in the Apple Media Services Terms and Conditions, except that Autonomic may be accessed and used by other accounts associated with you via Family Sharing or volume purchasing.

Maintenance and support. We are solely responsible for providing any maintenance and support services for Autonomic, as specified in this agreement or as required under applicable law. Apple has no obligation whatsoever to furnish any maintenance and support services for Autonomic.

Warranty. We are solely responsible for any product warranties, whether express or implied by law, to the extent not effectively disclaimed. In the event of any failure of Autonomic to conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price (if any) for the app to you. To the maximum extent permitted by applicable law, Apple will have no other warranty obligation whatsoever with respect to Autonomic, and any other claims, losses, liabilities, damages, costs or expenses attributable to any failure to conform to any warranty will be our sole responsibility.

Product claims. We, not Apple, are responsible for addressing any claims relating to Autonomic or your possession and use of it, including but not limited to: (i) product liability claims; (ii) any claim that Autonomic fails to conform to any applicable legal or regulatory requirement; and (iii) claims arising under consumer protection, privacy, or similar legislation, including in connection with Autonomic's use of the HealthKit framework.

Intellectual property rights. In the event of any third-party claim that Autonomic or your possession and use of it infringes that third party's intellectual property rights, we, not Apple, will be solely responsible for the investigation, defence, settlement and discharge of any such claim.

Legal compliance. You represent and warrant that you are not located in a country that is subject to a U.S. Government embargo, or that has been designated by the U.S. Government as a "terrorist supporting" country, and that you are not listed on any U.S. Government list of prohibited or restricted parties.

Developer name and address. Questions, complaints or claims with respect to Autonomic should be directed to: [LEGAL NAME], [MAILING ADDRESS], [PHONE], austin@discoverymark.com.

Third-party terms. You must comply with applicable third-party terms of agreement when using Autonomic.

Third-party beneficiary. You acknowledge and agree that Apple, and Apple's subsidiaries, are third-party beneficiaries of this agreement, and that upon your acceptance of this agreement Apple will have the right (and will be deemed to have accepted the right) to enforce this agreement against you as a third-party beneficiary of it.

CONTACT

Questions about these Terms can be raised through the app's App Store listing or by emailing austin@discoverymark.com.
