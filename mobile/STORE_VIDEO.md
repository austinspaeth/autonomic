# App Store creative video: "One day, five questions"

Production guide for the live-action video creative assets Apple announced
for iOS 27 / iPadOS 27 (product page header and search results). Built in
**Google Flow** with **Nano Banana Pro** (stills) and **Veo 3.1** (motion), with
real app UI composited onto the phone and watch in post.

The concept: we follow one young woman with POTS through a single day, from
waking up to lights out. Each beat opens on a question she is silently asking
herself. We see the moment that raises it, then the phone or watch answers it
in her hand. **The device always arrives inside the scene and never pops up
over it.**

---

## 0. What Apple wants (verified 2026-10-23)

Sources: Apple's *Creative assets specifications*, *App Store asset best
practices*, and *App preview specifications*.

| Placement | Aspect | Video resolution | fps | Length | Audio |
| --- | --- | --- | --- | --- | --- |
| **Product page header** | 21:9 | **3840 × 1646** | 30 or 60 | 5–30 s | Muted by default; viewer can unmute |
| **Search results** | 3:2 | min 1920 × 1280, max 3840 × 2560 | 30 or 60 | 5–30 s | **Always muted** |
| In-App Event card (optional reuse) | 16:9 | 1920×1080 – 3840×2160 | 30 or 60 | 15–30 s | — |
| In-App Event details (optional reuse) | 9:16 | 1080×1920 – 2160×3840 | 30 or 60 | 15–30 s | — |

Files can be `.mov`, `.m4v` or `.mp4`. Both placements **loop continuously**.
Still images must have no alpha channel. For a still fallback, a single 16:9
PNG at 5244 × 2950 serves both placements.

**Rules that shape the creative** (from Apple's best-practices page):

- **One clear idea, for a first-time visitor.** Lead with the value; the
  opening frame works as the poster.
- **No quick cuts or fast motion.** Each cut needs time to register.
- **Loop seamlessly**, with no visible jump at the seam.
- **Works silent first.** Any music is a soft loop, with no sudden loud
  moments.
- **Use real UI**, and give the story a beginning, middle and end.
- **Keep the focal point centred.** Assets render differently across the
  store; key art stays inside each template's safe area.
- **On-screen text is a short phrase** that adds to the picture rather than
  describing it. Localise it.
- **Content limits:** 4+ rating. No prices, discounts, URLs or ©. No other
  platforms' logos. No unverifiable claims and no Apple award badges.

> ⚠️ **This is NOT an App Preview.** App previews (the 886×1920 slots beside
> screenshots) may only contain screen captures of the app itself (Guideline
> 2.3.4). Live-action people get them rejected. This piece is for the **header
> and search-result creative assets** (plus In-App Events). Keep your existing
> UI-only previews where they are.

---

## 1. One master, two crops (safe areas)

Generate and edit **one 16:9 master at 3840 × 2160**, then crop both
deliverables out of it. Nothing is re-shot per format.

```
16:9 master 3840 × 2160
┌──────────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░ cut by 21:9 (top 257 px) ░░░░░░░░░░░░░░░░░░ │
│░░┌──────────────────────────────────────────────────────┐░░│
│░░│              BOTH-CROP AREA  3240 × 1646             │░░│
│░░│        x 300 → 3540        y 257 → 1903              │░░│
│░░│         ┌──────────────────────────────┐             │░░│
│3:2│        │  HERO ZONE  ~1900 × 1100      │             │3:2│
│cut│        │  face + screen + text live    │             │cut│
│░░│         │  here                         │             │░░│
│░░│         └──────────────────────────────┘             │░░│
│░░└──────────────────────────────────────────────────────┘░░│
│ ░░░░░░░░░░░░░ cut by 21:9 (bottom 257 px) ░░░░░░░░░░░░░░░░░ │
└──────────────────────────────────────────────────────────────┘
```

| Deliverable | Crop from the 4K master | Output |
| --- | --- | --- |
| Header 21:9 | full width, centre 1646 px of height (y 257–1903) | 3840 × 1646, no scaling |
| Search 3:2 | full height, centre 3240 px of width (x 300–3540) | 3240 × 2160 (valid 3:2, inside min/max), no scaling |

**Framing rules for every shot:**

1. **Keep her face, the device screen and the question text inside the HERO
   ZONE**, roughly the central 50% of the width and 50% of the height. The
   both-crop area is the hard limit. The hero zone is there because Apple
   warns that assets "render differently" across the store and on smaller
   devices.
2. **Before you lock the edit, download Apple's Header and Search-results
   templates** (Figma, Photoshop or Pixelmator, linked from the best-practices
   page). Export each template's safe-area guide as a PNG and lay it over the
   timeline as a guide layer. The store's own UI (app name, icon, Get button)
   sits over part of the header. The template shows where, and it overrides
   this diagram.
3. **Compose wide and centre-weighted.** Put her and the device close
   together in the middle third, with negative space (window, wall, bedding)
   at the edges, where it can be cut safely.
4. **Check the result with App Store Connect's Preview tool** before
   submitting.

---

## 2. The story

### The hook

The video opens on a frame every POTS patient knows from their own body. She
sits on the edge of the bed at dawn, palms pressed into the mattress, waiting
for the head rush to pass before she dares stand. Navy compression socks,
and a giant water tumbler on the nightstand. The first question appears over
it. Somebody with POTS recognises themselves before they have read a word.
Somebody without it simply sees a tired woman, which costs nothing.

**In-group signals, used throughout** (each one says "this was made by
someone who gets it", and none needs explaining): the pause before standing,
compression socks, the oversized insulated tumbler, an electrolyte sachet, a
stool at the sink, legs up the wall in the evening, and a doctor who starts
with his arms folded.

### The five questions

| # | Time of day | Question (on-screen text) | The fear behind it | Feature that answers it |
| --- | --- | --- | --- | --- |
| 1 | Dawn, in bed | **Am I going to crash today?** | Waking up not knowing what kind of day the body will allow | **Live HRV reading** → **Autonomic Outlook score** |
| 2 | Midday, kitchen | **Can I manage the dishes?** | Every chore spends energy that's in short supply | **Pacing budget** (on the Apple Watch) |
| 3 | Afternoon, couch | **Is magnesium even helping?** | Money and hope spent on supplements, with no way to know | **Insights** (biggest change since a start date) |
| 4 | Afternoon, clinic | **Will my doctor believe me?** | Years of "it's just anxiety" | **POTS stand test result** (heart-rate rise, graded) |
| 5 | Evening, bed | **Am I actually getting better?** | Recovery is too slow to feel from one day to the next | **Progress** (month trend) |

Why these five: they run from the most immediate fear (today) to the deepest
one (ever). Together they cover every headline feature: capture, score,
pacing, Insights, POTS testing and Progress. Questions 2 and 4 are the
emotional peaks: 2 is the most specific to life with POTS, and 4 is the most
painful. Questions 1 and 5 bookend the day and the loop.

Alternates, if A/B testing later: *"Why do I feel worse today?"*, *"Did
yesterday cost me today?"* (pacing / post-exertional malaise), *"Is this just
in my head?"* (swap for #4), *"Can I shower and cook?"* (swap for #2).

**Copy guardrails** (these match the app's own rules in `CLAUDE.md`):

- Questions only. **No captions that answer them.** The answer is the UI, so
  we never write a claim like "predicts crashes" or "proves POTS".
- The app is a journal, not a medical device. Nothing on screen diagnoses
  anything.
- No prices, no "free", no Pro badge, no paywall, no locks.
- Pacing is never shown in the red "over budget" state (it should not be the
  first thing a stranger sees). Ahead of pace (gold) is the hero state.

### The loop

The video ends with her switching off the bedside lamp. The room goes dark,
the wordmark fades in and out, and then the room fills with dawn. That dawn
frame matches the opening frame's light and location, so night cuts into
morning and the loop reads as *the next day*, not as a restart.

---

## 3. Storyboard

### Master cut: Product page header, 30.0 s

| Shot | In → out (s) | Dur | Frame | What happens | Device / screen | On-screen text |
| --- | --- | --- | --- | --- | --- | --- |
| **1A** | 0.0 → 2.6 | 2.6 | MCU, eye level, slight side angle | Dawn. Maya sits on the bed edge, palms on the mattress, eyes closed, one slow breath. Socks and tumbler in frame. **Poster frame.** | Phone face-down on nightstand | **Am I going to crash today?** (fades in at 0.3) |
| **1B** | 2.6 → 4.6 | 2.0 | Over-the-shoulder (OTS), sitting against the headboard | Fingertip resting over the phone's rear camera, phone in both hands in her lap, breathing slowly. | **S1** live HRV reading (dark mode) | (question holds) |
| **1C** | 4.6 → 6.6 | 2.0 | Slow push-in on the phone in her hands | Her thumb scrolls once. She exhales: an okay day. | **S2** Journal Outlook (score + pacing strip) | (fades out at 6.3) |
| **2A** | 6.6 → 8.8 | 2.2 | Medium-wide, kitchen | Midday. A sink stacked with dishes. She stands with her tumbler, looks at the pile, shoulders drop. | — | **Can I manage the dishes?** |
| **2B** | 8.8 → 10.6 | 1.8 | Close-up on her left wrist, her face soft in the background | She raises her wrist and glances at the watch. | **S3** watch pacing (gold, ahead of pace) | (holds) |
| **2C** | 10.6 → 12.4 | 1.8 | Medium | She pulls a wooden stool to the sink, sits, pushes up her sleeves and starts washing. Small, satisfied half-smile. | — | (fades out at 12.1) |
| **3A** | 12.4 → 14.0 | 1.6 | Close-up, hands | Couch, afternoon light. She tips one capsule from an amber, unlabelled bottle into her palm and looks at it, unconvinced. | — | **Is magnesium even helping?** |
| **3B** | 14.0 → 17.0 | 3.0 | OTS on the couch, under a knit throw | She scrolls, stops, and her eyebrows lift slightly. | **S4** Insights: magnesium finding → its chart | (fades out at 16.7) |
| **4A** | 17.0 → 18.6 | 1.6 | Medium two-shot, exam room | She sits on the exam table in her cardigan. The doctor stands, arms folded, polite and unconvinced. She grips the phone. | Phone in hand, screen not yet visible | **Will my doctor believe me?** |
| **4B** | 18.6 → 21.0 | 2.4 | 45° from the doctor's side, phone mid-frame | She turns the phone toward him and holds it out. | **S5** POTS stand test result | (holds) |
| **4C** | 21.0 → 22.6 | 1.6 | Two-shot, rack focus from him to her | He unfolds his arms, leans in and nods slowly. Focus racks to her as she exhales with relief. | (screen out of focus) | (fades out at 22.3) |
| **5A** | 22.6 → 24.2 | 1.6 | Wide, warm lamp | Evening. She lies across the bed with her legs up the wall, compression socks on, phone held above her face. | Phone overhead, screen not visible | **Am I actually getting better?** |
| **5B** | 24.2 → 27.2 | 3.0 | High angle from behind her head, looking down at the screen | She scrolls. A small private smile, then she lowers the phone to her chest. | **S6** Progress, month view, score trending up | (fades out at 26.9) |
| **6** | 27.2 → 30.0 | 2.8 | Wide bedroom, same setup as 1A | She reaches over and clicks off the lamp. Darkness, with the wordmark **Autonomic** at 27.8–28.8. Dawn light rises through the curtains, matching 1A's light, then hard cut to 1A on loop. | — | **Autonomic** (wordmark) |

Rhythm: each question gets a **beat of life (no device) → device in hand →
reaction**. Cut on motion: a lifting wrist, a turning phone, a scrolling
thumb. Shots run 1.6–3.0 s. If a test viewer says it feels rushed, drop beat
3 for a 4-question header cut (shift the times up by 4.6 s and stretch the
other shots).

### Search-results cut: 3:2, 15.0 s

Search results always play muted, at thumbnail size, next to the app's name.
The purpose has to be obvious at a glance, so use fewer beats and keep the
screens big.

| Shot | In → out | Use |
| --- | --- | --- |
| 1A | 0.0 → 2.4 | as above (hook + poster) |
| 1C | 2.4 → 5.0 | the Outlook push-in (skip 1B) |
| 2A | 5.0 → 6.8 | dishes |
| 2B | 6.8 → 9.0 | watch pacing |
| 5A | 9.0 → 10.4 | legs up the wall |
| 5B | 10.4 → 13.4 | Progress |
| 6 | 13.4 → 15.0 | lamp off → dawn (wordmark optional at this size) |

For this cut, grab a **second, tighter crop** in the edit wherever the screen
is small. The 3:2 frame can be punched in up to ~120% on 1C, 2B and 5B and
still stay ≥ 1920 px wide.

### Optional reuse

- **In-App Event card (16:9)**: the master itself, unchanged, at 3840 × 2160.
- **In-App Event details (9:16)**: needs a vertical generation pass. The 16:9
  shots are too wide to crop to 9:16. Veo 3.1 generates 9:16 natively, so
  re-run only the shots you need.

---

## 4. Build order in Google Flow

```
Step 1  Character sheet (Nano Banana Pro)  ──► pick ONE, lock it
Step 2  Wardrobe + props sheets            ──► lock
Step 3  Doctor character                   ──► lock
Step 4  Location plates (5 rooms)          ──► lock
Step 5  Start frame per shot (Nano Banana: character + location refs)
Step 6  Animate each start frame (Veo 3.1 · Frames to Video · 16:9 · 8 s)
Step 7  Pick the best 2-3 s window of each take
Step 8  Upscale to 4K in Flow
Step 9  Record real app UI (simulator) per the screen list
Step 10 Composite UI onto phone/watch, conform to 30 fps, grade, edit, text
Step 11 Export header 21:9 + search 3:2, preview in App Store Connect
```

Rules that keep it realistic and consistent:

- **Every Veo shot starts from a Nano Banana still** (Frames to Video). Text
  to video alone will drift her face, hair clip and socks from shot to shot.
  Use **Ingredients to Video** only as a fallback, with the character sheet,
  wardrobe sheet and location plate as the three ingredients.
- **Re-attach the locked character sheet to every image generation.** Don't
  chain generations from the previous output, which compounds drift.
- **Ask Veo for slow, deliberate motion and keep only the best 2–3 seconds.**
  Generate 8 s at 4 variations per shot. The action you want usually lands
  between seconds 1 and 5.
- **Never let Veo render the UI or any text.** Phone and watch screens are
  prompted as a *plain, uniform, featureless grey glow* and replaced in post
  (section 7). The question text is added in the edit.
- **Hands are the failure point.** Keep fingers still on the device, avoid
  typing or tapping close-ups, and hold the phone in two hands or by its
  edge. Reject any take with extra fingers or a warping phone.
- **Mute Veo's audio.** Prompt "ambient room tone only, no dialogue, no
  music". It gets replaced anyway, but this stops Veo inventing lip movement.

---

## 5. Prompts: characters, wardrobe, locations

> Cast note: POTS mostly affects women aged roughly 15–50. **Maya** is written
> as 26 so she reads as the core audience. The description below is a
> default; swap any physical trait, but keep it specific. Vague characters
> drift.

### Step 1: Character sheet (Nano Banana Pro, 16:9)

```
Photorealistic character reference sheet of a single woman, shown five times on a
seamless warm light-grey studio background: full-body front view, full-body
three-quarter view, full-body profile, head-and-shoulders front close-up, and a
close-up of both hands.

She is Maya, 26 years old, slim-average build, 5'5". Light olive skin with faint
freckles across the nose, natural undone brows, dark brown wavy shoulder-length
hair loosely twisted up in a tortoiseshell claw clip with a few strands falling
around her face. Soft hazel-brown eyes with faint shadows underneath — she looks
tired but warm, not sick, not glamorous. Almost no makeup, natural lips, small
gold huggie earrings, short unpainted nails.

Wardrobe: oversized heather-grey crewneck sweatshirt, charcoal high-waisted
leggings, navy-blue knee-high compression socks. On her left wrist a small
silver-aluminium smartwatch with a pale sage-green woven loop band.

Even soft studio light, true skin texture with visible pores and fine peach fuzz,
natural asymmetry, shot on a full-frame camera with an 85mm lens, f/4.
Documentary realism, not a fashion shoot.

No text, no labels, no logos, no watermarks.
```

Generate 8 or more. Pick the one whose face you'd believe across 15 shots, and
regenerate it 2–3 more times *using that image as a reference* until the face
holds. Save the final as **`REF_maya.png`**.

### Step 2a: Clinic wardrobe (same woman)

```
Using the woman in the reference image, keep her face, hair, claw clip, build and
skin exactly the same. Full-body front and three-quarter views on the same grey
background. She now wears an oatmeal chunky-knit open cardigan over the same
heather-grey sweatshirt, the same charcoal leggings and navy compression socks,
white low-top canvas sneakers, and a natural canvas tote bag on her shoulder.
Same sage-band smartwatch on her left wrist. Photorealistic, 85mm, soft studio
light. No text, no logos.
```

Save as **`REF_maya_clinic.png`**.

### Step 2b: Props sheet

```
Photorealistic product reference sheet on a warm light-grey background, evenly lit,
no logos or brand marks or text anywhere:
1) a modern smartphone with thin even bezels in a matte sage-green silicone case,
   front and back, screen showing a plain uniform mid-grey glow;
2) a small silver-aluminium smartwatch with a pale sage-green woven loop band,
   screen showing a plain uniform black glow;
3) a 40-ounce pale-pink insulated tumbler with a handle, lid and straw;
4) a small amber-glass supplement bottle with a white cap and a blank cream label;
5) a single torn-open electrolyte drink sachet with a blank white wrapper;
6) a simple light-oak wooden kitchen stool.
```

Save as **`REF_props.png`**.

### Step 3: The doctor

```
Photorealistic character reference sheet, warm light-grey background: front,
three-quarter and profile head-and-shoulders, plus one full-body standing with arms
folded. A male physician in his late 50s, trim salt-and-pepper beard, short grey
hair, reading glasses pushed up on his head, kind but tired eyes. Navy quarter-zip
sweater over a light-blue collared shirt, stethoscope around his neck, a plain
white ID badge with no readable text. Natural skin texture, 85mm, soft light.
Realistic, not a stock-photo smile. No text, no logos.
```

Save as **`REF_doctor.png`**.

### Step 4: Location plates (16:9, no people)

Generate each room empty first. Lock them, then reuse them as references so
every shot in a room matches.

**LOC_bedroom_dawn**

```
Photorealistic interior photograph, 16:9. A small, lived-in apartment bedroom at
dawn. A full-size bed with rumpled oatmeal linen bedding and two pillows against a
plain wooden headboard, centred in frame. On the left a small oak nightstand with a
ceramic lamp (off), a pale-pink insulated tumbler with a straw, one torn electrolyte
sachet, and a smartphone lying face-down on a charging cable. Sheer white curtains
on the right glowing with cool blue-pink pre-sunrise light; the rest of the room in
soft shadow. A plain white wall with one small framed print (abstract, no text).
Shot on a full-frame camera, 35mm lens, f/2.0, natural light only, gentle film
grain, true-to-life colour. No people, no text, no logos.
```

**LOC_bedroom_night**: same prompt with the bedroom reference attached:
*"Same room, same layout, now at night: the ceramic lamp is on, casting warm
2700K light; curtains dark blue beyond; cosy and quiet."*

**LOC_kitchen_midday**

```
Photorealistic interior photograph, 16:9. A small, slightly cluttered apartment
kitchen at midday, bright soft daylight from a window over the sink. The sink is
centred in frame and piled high with dishes: stacked plates, two pans, mugs, a
mixing bowl. Light wood countertops, white subway tile, a dish rack, a tea towel
over the oven handle, a few plants on the windowsill. A light-oak wooden stool
tucked against the far wall. 35mm lens, f/2.8, natural light, subtle grain,
realistic everyday mess. No people, no text, no logos.
```

**LOC_livingroom_afternoon**

```
Photorealistic interior photograph, 16:9. A small apartment living room in late
afternoon, warm low golden sunlight raking through a window on the left. A soft
grey three-seat sofa, centred, with a chunky cream knit throw and two cushions. A
low oak coffee table in front holding a pale-pink insulated tumbler, a small
amber-glass supplement bottle with a blank label, and a paperback face-down. Plants,
a floor lamp, a woven rug. 35mm, f/2.0, natural light, gentle grain. No people, no
text, no logos.
```

**LOC_clinic**

```
Photorealistic interior photograph, 16:9. A modern, slightly worn outpatient
exam room in soft daylight from a frosted window. An exam table with crinkled white
paper centred in frame, a wall-mounted blood-pressure cuff, a small desk with a
closed laptop, a rolling stool, pale-sage walls, a sink with a paper-towel
dispenser. Calm, real, not glossy. 35mm, f/2.8, natural light with a touch of
neutral overhead fluorescent fill, subtle grain. No people, no readable text, no
posters with words, no logos.
```

---

## 6. Shot-by-shot prompts

Each shot has two prompts:

- **START FRAME** (Nano Banana Pro, 16:9). Attach the listed refs.
- **VEO 3.1** (Frames to Video, 16:9, 8 s, 4 variations). Attach that start
  frame.

Every Veo prompt ends with the shared tail below. Paste it in each time:

```
STYLE TAIL — Photorealistic live-action, documentary realism, shot on a full-frame
cinema camera, natural light, shallow depth of field, gentle organic film grain,
true skin texture, subtle handheld micro-movement. Slow, deliberate, natural
motion. The phone screen shows only a plain uniform featureless grey glow and the
watch screen a plain uniform black glow — no text, no icons, no interface. No text
or captions anywhere in frame. No logos. Ambient room tone only, no dialogue, no
music. Avoid: extra fingers, warped hands, morphing objects, face changing,
jump cuts, fast camera moves, smiling at camera, looking into the lens.
```

---

### 1A: Hook: the morning brace (dawn)

**Refs:** `REF_maya`, `LOC_bedroom_dawn`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. The woman from the reference sits on the edge of the bed
in the reference bedroom at dawn, facing slightly left of camera, centred in frame.
Both palms pressed flat into the mattress either side of her, shoulders slightly
raised, eyes closed, lips parted mid-breath — steadying herself before standing.
Heather-grey sweatshirt, charcoal leggings, navy knee-high compression socks
clearly visible, bare feet flat on a wooden floor. Hair in the tortoiseshell claw
clip, a few strands loose. The pink tumbler and face-down phone on the nightstand
beside her. Cool blue-pink window light from the right edging her face, the room
in soft shadow. Medium close-up from the knees up, 50mm, f/2.0, eye level.
No text, no logos.
```

**VEO 3.1**

```
She stays seated on the edge of the bed, palms pressed into the mattress. She takes
one slow, deep breath in, her shoulders rising, then lets it out slowly; her head
tips forward a few degrees and her eyes stay closed, as if waiting for a wave of
dizziness to pass. A loose strand of hair shifts. Dawn light slowly brightens on
the curtains. Camera: locked-off with the faintest handheld breathing, a very slow
2% push-in.
[STYLE TAIL]
```

*Keep:* the 2.6 s around the exhale. **This is the poster frame**, so choose
a take whose first frame is already beautiful (eyes closed, palms down).

---

### 1B: Morning HRV reading (dawn)

**Refs:** `REF_maya`, `LOC_bedroom_dawn`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Over-the-shoulder view from just behind and above her
right shoulder: the woman sits up in bed against the headboard, duvet over her
legs, holding the sage-cased smartphone in both hands at lap height, screen tilted
up toward the camera at about 20 degrees. Her right index fingertip rests gently
over the phone's rear camera lens on the back of the phone; her left thumb lightly
on the side edge, not covering the screen. The screen shows a plain uniform
mid-grey glow, fully visible, centred in frame. Her face in soft profile at the
left of frame, eyes on the screen, calm. Cool dawn light, phone glow lifting her
chin. 35mm, f/2.2. No text, no logos.
```

**VEO 3.1**

```
She holds perfectly still with her fingertip over the phone's rear camera, breathing
slowly and evenly — her chest and shoulders rise and fall gently. Her eyes stay on
the screen. The phone stays steady and fully visible, screen facing up toward the
camera, no tapping. Morning light drifts slowly across the duvet. Camera: very slow
handheld drift, staying over her shoulder.
[STYLE TAIL]
```

**Screen:** S1 (dark mode).

---

### 1C: The Outlook (dawn)

**Refs:** `REF_maya`, `LOC_bedroom_dawn`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Close shot of the woman's two hands holding the
sage-cased smartphone upright at chest height, screen facing the camera straight-on
and filling about 30% of the frame width, centred. Her thumbs at the lower bezel,
not covering the screen. Behind, softly out of focus: her face looking down at the
phone, the rumpled bed, dawn window. The screen is a plain uniform mid-grey glow.
50mm, f/1.8. No text, no logos.
```

**VEO 3.1**

```
She holds the phone steady and reads. Her right thumb makes one slow, small upward
scroll on the lower part of the screen, then rests. In the soft background her face
relaxes and she lets out a quiet breath of relief. Camera: slow, smooth push-in
toward the phone, about 8% over the shot. The screen stays square to camera and
unobstructed.
[STYLE TAIL]
```

**Screen:** S2 (dark mode). Time the scroll in the recording to her thumb.

---

### 2A: The dishes (midday)

**Refs:** `REF_maya`, `LOC_kitchen_midday`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. The woman stands in the reference kitchen at midday,
slightly right of centre, side-on to camera, facing the sink piled high with dishes.
She holds the pale-pink tumbler against her chest with both hands, lips
closed, simply looking at the pile. Same sweatshirt, leggings, navy compression socks, claw clip. Bright soft
daylight from the window over the sink. Medium-wide shot, knees up, 35mm, f/2.8.
No text, no logos.
```

**VEO 3.1**

```
She looks at the stacked dishes in the sink for a long moment. Her shoulders drop
slightly and she lets out a slow, tired exhale through her nose, lowering the
tumbler onto the counter beside her. Steam-free, quiet, still daylight. Camera:
locked-off, gentle handheld breathing.
[STYLE TAIL]
```

---

### 2B: Pacing on the wrist (midday)

**Refs:** `REF_maya`, `LOC_kitchen_midday`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Close-up: the woman's left forearm raised in the
foreground, wrist turned toward the camera, the small silver smartwatch with the
sage woven band sharp and centred in frame, its screen a plain uniform black glow,
face square to camera. Behind it, softly out of focus, her face glancing down at
the watch and the blurred kitchen sink full of dishes. Bright midday window light.
85mm, f/2.0. No text, no logos.
```

**VEO 3.1**

```
She lifts her left wrist slightly higher and turns it a few degrees toward herself
to read the watch, then holds still for a moment, eyes on it. The watch face stays
square to camera, sharp and unobstructed. Background stays soft. Camera: steady,
minimal movement, focus held on the watch.
[STYLE TAIL]
```

**Screen:** S3 (watch, black).

---

### 2C: She sits (midday)

**Refs:** `REF_maya`, `LOC_kitchen_midday`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. The woman sits on the light-oak wooden stool pulled up
to the kitchen sink, sleeves of the grey sweatshirt pushed up to the elbows, hands
in warm soapy water washing a plate, small soft half-smile, compression socks
visible on her feet hooked on the stool rung. The dish pile beside her. Midday
light from the window. Medium shot from the side, centred, 35mm, f/2.8.
No text, no logos.
```

**VEO 3.1**

```
Seated on the stool at the sink, she calmly washes a plate in soapy water, turns
it over, and places it in the dish rack beside her, then reaches for the next one.
A small, quietly satisfied half-smile. Natural, unhurried pace. Camera: slow lateral
drift of a few centimetres to the right.
[STYLE TAIL]
```

> Option: if you'd rather show her *pulling the stool over*, generate it as a
> separate 8 s take. It is a more complex action and Veo often fumbles the
> stool's legs, so the seated version is the safe default.

---

### 3A: The capsule (afternoon)

**Refs:** `REF_maya`, `LOC_livingroom_afternoon`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Close-up on the woman's hands above the coffee table:
her left palm open and cupped, her right hand tipping the small amber-glass bottle
with the blank cream label so that one capsule rests in her palm. The pink tumbler
softly out of focus beside them. Warm low golden afternoon light raking from the
left. Her face just visible at the top edge, out of focus, looking down. 85mm,
f/2.0. No text, no logos.
```

**VEO 3.1**

```
She holds the single capsule in her open palm and looks at it for a moment, rolling
it once with her thumb, unconvinced. Her right hand sets the amber bottle down on
the coffee table. Golden dust motes drift in the sunlight. Camera: steady, slow
slight push-in.
[STYLE TAIL]
```

---

### 3B: Insights (afternoon)

**Refs:** `REF_maya`, `LOC_livingroom_afternoon`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Over-the-shoulder from behind her left shoulder: the
woman curled up on the grey sofa under the cream knit throw, holding the sage-cased
smartphone in her right hand at chest height, screen tilted toward the camera and
fully visible, centred in frame, a plain uniform light-grey glow. Her profile soft
at the right of frame. Warm golden afternoon light behind her. 35mm, f/2.0.
No text, no logos.
```

**VEO 3.1**

```
She scrolls slowly once with her right thumb on the lower edge of the screen, stops,
and holds still, reading. Her eyebrows lift slightly and she tilts her head a few
degrees, surprised. The phone stays steady and fully visible. Camera: slow handheld
drift, holding the over-the-shoulder framing.
[STYLE TAIL]
```

**Screen:** S4 (light mode).

---

### 4A: The skeptic (clinic)

**Refs:** `REF_maya_clinic`, `REF_doctor`, `LOC_clinic`

**START FRAME**

```
Photorealistic still, 16:9. Inside the reference exam room. The woman, wearing the
oatmeal cardigan, sits on the edge of the exam table on the crinkled paper, canvas
tote beside her, holding the sage-cased smartphone in her lap with both hands,
screen facing down toward her lap. Facing her at a slight angle, the physician from
the reference stands with his arms folded, polite but unconvinced, head tilted.
Two-shot, both centred within the middle half of the frame, 35mm, f/2.8, soft
frosted-window daylight. No readable text, no logos.
```

**VEO 3.1**

```
The doctor stands with arms folded, listening politely but unconvinced, giving a
small doubtful nod. The woman looks down at the phone in her lap, her thumbs
tightening on it, gathering herself, then lifts her eyes to him. Quiet, tense,
realistic. Camera: locked-off with gentle handheld breathing.
[STYLE TAIL]
```

---

### 4B: She shows him (clinic)

**Refs:** `REF_maya_clinic`, `REF_doctor`, `LOC_clinic`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. Camera positioned beside the doctor at 45 degrees. The
woman on the exam table holds the sage-cased smartphone out toward the doctor at arm's
length, screen facing him and angled about 30 degrees toward the camera so it is
clearly visible, centred in frame, a plain uniform light-grey glow. Her expression
earnest. The doctor's shoulder and folded arm soft in the foreground left. 50mm,
f/2.0. No readable text, no logos.
```

**VEO 3.1**

```
She extends the phone a little further toward the doctor and holds it steady for
him, her thumb on the bezel edge, not covering the screen. Earnest, hopeful
expression. In the soft foreground the doctor's folded arm begins to loosen. The
phone screen stays fully visible and steady. Camera: very slow push toward the
phone.
[STYLE TAIL]
```

**Screen:** S5 (light mode).

---

### 4C: He leans in (clinic)

**Refs:** `REF_maya_clinic`, `REF_doctor`, `LOC_clinic`

**START FRAME**

```
Photorealistic still, 16:9. Two-shot profile. The doctor, arms now unfolded, leans
in toward the phone the woman is holding between them, reading glasses lowered onto
his nose, attentive. The woman sits on the exam table watching his face. The phone
screen faces away from camera. Both centred within the middle half of the frame.
Doctor in sharp focus, the woman slightly soft. 50mm, f/2.0, soft daylight.
No readable text, no logos.
```

**VEO 3.1**

```
The doctor studies the phone, then nods slowly twice, his expression changing from
doubtful to serious and engaged; he points briefly at the screen. Focus racks
smoothly from the doctor to the woman, whose shoulders drop as she lets out a long
breath of relief, her eyes glistening slightly. Camera: steady, rack focus from him
to her.
[STYLE TAIL]
```

---

### 5A: Legs up the wall (evening)

**Refs:** `REF_maya`, `LOC_bedroom_night`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. The reference bedroom at night, ceramic lamp on, warm
2700K glow. The woman lies on her back across the bed with her legs raised straight
up resting against the wall, navy compression socks clearly visible, grey
sweatshirt, hair spread on the duvet with the claw clip loosened. She holds the
sage-cased smartphone above her face with both hands, screen facing down toward
her. Wide shot from the side, the whole figure centred in the middle half of the
frame, 28mm, f/2.2. No text, no logos.
```

**VEO 3.1**

```
Lying with her legs up the wall, she holds the phone above her face and scrolls
slowly with one thumb. Her feet in the compression socks shift gently against the
wall. Warm lamplight, quiet, still. Camera: very slow lateral slide.
[STYLE TAIL]
```

---

### 5B: Progress (evening)

**Refs:** `REF_maya`, `LOC_bedroom_night`, `REF_props`

**START FRAME**

```
Photorealistic still, 16:9. High angle from just behind and above her head, looking
down along her: the woman lies on her back on the bed, holding the sage-cased
smartphone above her face in both hands, the screen facing her and visible to the
camera at a shallow angle, centred in frame, a plain uniform dark-grey glow. Her
eyes and the top of her face visible at the bottom edge of frame, soft. Warm lamp
light from the side. 35mm, f/2.0. No text, no logos.
```

**VEO 3.1**

```
She scrolls slowly once, then stops and holds the phone still, looking at it. A
small, private smile grows. After a moment she slowly lowers the phone down onto
her chest and closes her eyes. Camera: steady, a gentle slow pull-back as the phone
lowers.
[STYLE TAIL]
```

**Screen:** S6 (dark mode). Composite only the part of the shot before the
phone lowers.

---

### 6: Lamp off → dawn (the loop)

**Refs:** `LOC_bedroom_night`, `LOC_bedroom_dawn`, `REF_maya`

Build it as **two Veo clips joined through black**:

**6-i START FRAME**: the wide bedroom at night, matching 1A's camera angle.
She lies in bed under the duvet with her arm reaching to the lamp switch.

**6-i VEO 3.1**

```
She reaches out and clicks off the bedside lamp. The room falls into darkness, only
the faint deep-blue night glow at the curtains remaining. She settles back into the
pillow. Camera: locked-off.
[STYLE TAIL]
```

**6-ii**: use **Frames to Video with both a start and an end frame**. Start
frame: the same dark room (a still from the end of 6-i). End frame:
`LOC_bedroom_dawn` with her asleep on her side, framed exactly like 1A's
wide.

```
Time-lapse feel compressed into one smooth shot: the dark bedroom slowly fills with
cool blue then soft pink dawn light through the sheer curtains as night becomes
morning. She sleeps, motionless. Camera: perfectly locked-off.
[STYLE TAIL]
```

In the edit: 6-i (lamp click) → black (wordmark) → 6-ii (dawn rises) → **cut
on the loop to 1A**. 1A's light, curtains and nightstand must match the last
frame of 6-ii. Grade them as a pair.

---

## 7. Real app UI: what to record, then how to put it on the devices

Apple asks for **real UI**, and the screen is the answer to each question, so
every screen is a real recording.

### Recording setup

- **iPhone:** a 17 Pro Max simulator (1320 × 2868), **60 fps**, using
  `xcrun simctl io booted recordVideo --codec h264`. Set the status bar to
  9:41 with full battery (`xcrun simctl status_bar booted override ...`).
- **Watch:** the largest watch simulator (Ultra 49 mm or Series 46 mm).
- **Data:** a seeded, realistic journal of **60+ days** with a magnesium start
  partway through and an upward arc. The demo generator in `src/lib/demo.ts`
  already models exactly this shape (`DEMO_DAYS`, `DEMO_MAG_START`). Generate
  one, export it, and import it on the simulator so it is *real* journal data.
  Progress and Insights then render real findings, not demo banners. The scenes
  on the `screenshots` branch (`mobile/app/screenshots/`) are good references
  for which state looks best.
- **Tier:** Pro or trial, so nothing is locked. **No paywall, lock icon or
  price may appear.**
- **Appearance:** dark mode for the dawn and night scenes, light mode for
  daytime. Real phones auto-switch, and it sells the realism.
- Record **2–3 s longer than the shot** at each end, so the edit has handles.

### Screen list

| ID | Shot | Screen state | Mode | Motion in the recording |
| --- | --- | --- | --- | --- |
| **S1** | 1B | Live HRV session, camera (finger) source, baseline. Timer ~3:10 counting, live HR / SDNN sparklines and the raw beat-to-beat RR trace moving, signal-quality dot good | Dark | None; let the trace run |
| **S2** | 1C | Journal top: **Autonomic Outlook** card with score gauge, guidance line, and the **pacing strip** early in the day (green, mostly unspent, "About 2h 10m"-style figure) | Dark | One slow small scroll, timed to her thumb |
| **S3** | 2B | Watch **pacing view**, **gold / ahead of pace** state, bar past the pace marker, Spent / Budget tiles | Black | Static; the marker may tick |
| **S4** | 3B | Insights → **Biggest change** card about magnesium, e.g. *"RMSSD is up since you started Magnesium"*; then the **Change details** sheet with the chart and before/after divider | Light | Scroll, stop, sheet rises (≤ 3 s) |
| **S5** | 4B | **POTS stand test result** with the lying → standing heart-rate chart and the graded rise (a ≥ 30 bpm rise reads clearly) | Light | Static or a tiny settle |
| **S6** | 5B | **Progress → Month**: Autonomic Score card with a visibly upward trend. Optionally end on the Insights header *"N pts better than day one"* | Dark | One slow scroll |

Keep the numbers coherent across the day. The morning's budget must be the
same budget the watch shows at midday, with its spend realistic for that hour.
Use whatever your seeded journal produces. **Don't hand-edit numbers onto the
screens.**

### Compositing (DaVinci Resolve Fusion or After Effects + Mocha)

1. **Planar-track** the phone or watch screen on the Veo plate (Fusion Planar
   Tracker, or Mocha AE). Track the screen glass, not the case.
2. **Corner-pin** the recording onto the track. Scale it so the UI's rounded
   corners sit just inside the glass.
3. **Make it look like it belongs there:**
   - Match the light. Pull the UI down 10–20% in the dim dawn and night shots,
     and add a slight warm or cool tint matching the room.
   - Lay the plate's own highlights back over the UI at 10–25% (Screen or Add
     mode, luma-keyed) for glass reflections.
   - Match focus blur and motion blur to the plate. Add the same grain on top.
   - Rotoscope any finger or thumb that crosses the screen and put it back
     over the UI.
   - The screen should emit light: add a faint glow onto her thumb and chin
     where the plate already shows one.
4. **Time the UI motion to her hands.** A scroll in the recording lands on
   the frame where her thumb moves.
5. **Readability check:** at thumbnail size in the 3:2 cut, can you tell what
   each screen *is* (a score, a bar, a chart)? If not, punch in.

---

## 8. Edit, text, sound, export

### Frame rate

Veo outputs **24 fps**; Apple accepts **only 30 or 60**. Edit on a **30 fps
timeline** and convert every clip with optical-flow interpolation (Resolve
*Speed Warp*, or Topaz Video AI *Apollo/Chronos*). **Don't** play 24 fps
footage at 30 fps: that speeds people up by 25% and it looks wrong. Composite
the UI after the frame-rate conversion, or record the UI at 60 fps and
conform it with the plate.

### Resolution

Upscale every chosen take to 4K in Flow. If your plan stops at 1080p, use
Topaz Video AI (Proteus or Rhea, low "add detail") to reach 3840 × 2160
**before** compositing. A soft plate under a razor-sharp UI is the most
obvious "fake" tell there is.

### Grade

One look for the whole day, moving with the clock: cool blue-pink at dawn,
neutral bright at midday, golden in the afternoon, neutral daylight at the
clinic, warm 2700K tungsten in the evening, and back to dawn. Lift the
blacks slightly and keep skin true. Film grain over everything, UI included.

### Text: the five questions

- **Typeface:** Manrope (the app's figure face) in SemiBold / Bold. Or SF Pro
  Display Semibold, which Apple's templates assume.
- **Size:** cap height ≈ 4.5% of the 21:9 frame height (~75 px of 1646).
  Check that it stays legible in the 3:2 cut at phone size.
- **Colour:** white at 95% with a very soft shadow (0, 2 px, 12 px blur, 35%).
  No boxes or pills.
- **Position:** horizontally centred, inside the hero zone, in the **upper
  half**, over a quiet part of the plate (wall, curtain, window). Keep it off
  faces and screens, and confirm against the header template's overlay area.
- **Motion:** 10-frame fade with a 12 px rise in, 8-frame fade out. No typing
  effects; Apple asks for calm.
- **Copy:** sentence case, exactly as in the table. One question on screen at
  a time.
- **Wordmark (shot 6):** the Autonomic wordmark, white, centred, 1.0 s,
  fading in and out of the black.
- **Localisation:** text is a separate layer per language. For en-GB, the
  words are identical.

### Sound (header only; search is always muted)

- One soft, warm loop: felt piano or ambient pad, ~70 BPM, no drums, no
  vocals, and no sudden peaks. It must loop sample-accurately at exactly
  30.000 s.
- Optionally add very low room tone under each scene. Drop all Veo audio.
- Stereo, AAC 256 kbps, 48 kHz, one stereo track.

### Export

| File | Crop from master | Resolution | fps | Codec |
| --- | --- | --- | --- | --- |
| `autonomic_header_21x9_30s.mov` | y 257–1903 | 3840 × 1646 | 30 | ProRes 422 HQ (or H.264 High, ~40 Mbps .mp4) + music |
| `autonomic_search_3x2_15s.mov` | x 300–3540 (punch-ins allowed) | 3240 × 2160 | 30 | same, **no audio track needed** |
| `autonomic_event_16x9_30s.mov` (optional) | full | 3840 × 2160 | 30 | same |
| Still fallback `autonomic_universal_16x9.png` | best frame (1A or 2B) | 5244 × 2950 | — | PNG, no alpha |

**Loop check:** play the export on repeat 5 times. If you notice the seam,
fix the 6-ii → 1A match (light, curtain position, grade) or add a 4-frame
cross-dissolve inside the dark.

**Poster check:** freeze frame 0. With no motion and no sound, does it say
*"this is for someone like me"*? It should be shot 1A with the question
already legible (bring the text in by frame 10, not frame 30, if needed).

---

## 9. Pre-submission checklist

- [ ] Every face, screen and question sits inside the both-crop area and the
      template's safe area, checked in both crops.
- [ ] App Store Connect **Preview tool** checked for header and search.
- [ ] No price, discount, "free", URL, ©, award badge or other platform's logo.
- [ ] No locked or paywalled UI and no "Pro" badge visible on any screen.
- [ ] No over-budget (red) pacing state anywhere.
- [ ] No caption claims anything; the only text is the questions and the
      wordmark.
- [ ] Every UI frame is a real recording from the app, not mocked or edited.
- [ ] Hands: correct finger count in every frame, and no warping phone or
      watch.
- [ ] Maya's face, claw clip, sweatshirt, compression socks and watch band are
      consistent across all shots.
- [ ] 30 fps, correct resolutions, 5–30 s, loops seamlessly.
- [ ] Music (header only) loops cleanly, with no loud moments.
- [ ] 4+ appropriate (the supplement bottle is blank and unbranded; no
      medication brands).
