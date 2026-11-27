# UI/UX Design Audit and Optimization

## Executive recommendation

For this use case, **Impeccable `critique` is the best single tool**. For a more robust audit, combine it with Anthropic's official **`frontend-design` skill**, Vercel's **`web-design-guidelines`**, and the official **shadcn/ui skill**. Each serves a different purpose:

- **Impeccable:** visual critique, usability, prioritization, and creative refinement.
- **Anthropic `frontend-design`:** avoiding generic AI aesthetics and establishing a distinctive design language.
- **Vercel `web-design-guidelines`:** checking source code against UI, UX, and accessibility guidelines.
- **shadcn/ui:** implementing recommendations using the existing stack, components, tokens, and patterns.

**Terminology note:** A score such as “calligraphy 8/10” probably means **“typography 8/10.”** Calligraphy refers specifically to decorative handwriting.

---

## 1. Recommended skills and tools

### 1.1 Impeccable

**Assessment: Best overall choice for this use case.**

[Impeccable `critique`](https://impeccable.style/docs/critique/) is intended for interfaces that feel generic, confusing, or difficult to use. It reads source code and, when browser tools are available, can also inspect the rendered interface. Its report addresses design quality, usability, simulated review perspectives, strengths, prioritized issues, and open questions. The initial audit does not change code.

Install Impeccable:

```bash
npx impeccable install
```

Alternatively, install it as a general agent skill:

```bash
npx skills add pbakaus/impeccable
```

Impeccable supports tools including Claude Code, Cursor, Gemini CLI, and Codex. Its documentation also describes an experimental integrated variant for GitHub Copilot.

#### Recommended workflow

```text
/impeccable init
/impeccable document
/impeccable critique the dashboard
```

- **`init`** analyzes the project and records its audience, purpose, and constraints in `PRODUCT.md`. This context helps prevent generic recommendations.
- **`document`** records colors, typography, layout, elevation, shapes, and components in `DESIGN.md`. Review this output so existing design defects are not accidentally preserved as standards.
- **`critique`** identifies what limits the quality of the specific screen.

#### Relevant Impeccable commands

After the initial review, run targeted follow-up commands:

```text
/impeccable critique the dashboard
/impeccable distill the dashboard
/impeccable polish the dashboard
/impeccable audit the dashboard
```

- **`critique`:** What is not working, and what should be improved first?
- **`distill`:** What is overly complicated, cluttered, or competing for attention?
- **`polish`:** How can a fundamentally functional design be visually refined?
- **`audit`:** What implementation-quality problems exist?

If the concerns are “too complicated,” “too boring,” or “not creative enough,” **`critique`**, **`distill`**, and **`polish`** address the three main perspectives. Impeccable's `audit` primarily focuses on implementation quality.

#### Creative alternatives

Impeccable can use image generation to explore visual mockups before implementation. According to its documentation, this *comp-led* approach can produce bolder directions, whereas direct implementation in code tends to be more coherent but less ambitious. Transferring mockups to working code is imperfect and often takes multiple iterations.

**Recommendation:** Audit the code and screenshots first. Then generate mockups for only two or three selected directions.

### 1.2 Anthropic `frontend-design`

**Assessment: Best complement for avoiding boring or generic AI-generated designs.**

The [Anthropic `frontend-design` skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) promotes deliberate, distinctive design over reusable default aesthetics. It asks for a specific visual direction based on the product, audience, and task.

It highlights common AI-generated design defaults, including:

- Identical rounded cards for every piece of content.
- The same radius and shadow regardless of hierarchy.
- Decorative gradients.
- Excessive eyebrow labels.
- Arbitrary monospace labels.
- Unnecessary fade-and-slide-up animations.
- Emphasizing isolated words in headings.
- Numbered sections that do not represent an actual sequence.

It also recommends line lengths of roughly 80 characters at most, purposeful rather than arbitrary motion, and a coherent typographic and visual concept.

**Strength:** Particularly useful when the UI works but feels bland or insufficiently creative.

**Limitation:** It is not a comprehensive audit tool. Its strengths are art direction, typography, visual personality, layout concepts, and avoiding generic AI aesthetics. It is less suited to systematic code review, design-token drift, detailed shadcn component inspections, and prioritized defect lists.

**Use it after Impeccable `critique`, not instead of it.**

### 1.3 Vercel `web-design-guidelines`

**Assessment: Best rule-based source-code review.**

The [Vercel `web-design-guidelines` skill](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines) checks selected UI files against Web Interface Guidelines. It covers design, accessibility, and UX best practices and reports specific findings in `file:line` format.

Install it:

```bash
npx skills add https://github.com/vercel-labs/agent-skills \
  --skill web-design-guidelines
```

It is particularly useful for forms and interaction states, keyboard support, focus indicators, semantic HTML, problematic UI patterns, precise source locations, and technical UI quality.

**Limitation:** It can detect inconsistencies, accessibility failures, and implementation problems more reliably than it can judge whether a design is distinctive, creative, or emotionally suitable.

### 1.4 Official shadcn/ui skill

**Assessment: Essential for subsequent implementation.**

The official [shadcn/ui skill](https://ui.shadcn.com/docs/skills) reads `components.json` to identify the framework, Tailwind version, aliases, base library, icon library, installed components, and relevant paths. It also understands theming, CSS variables, OKLCH, dark mode, component composition, and registry usage.

Install it:

```bash
pnpm dlx skills add shadcn/ui
```

The skill favors existing components, semantic colors, and correct component composition. For example, it encourages semantic tokens such as `bg-primary` and `text-muted-foreground` instead of arbitrary raw colors.

**Limitation:** It does not provide a sufficiently critical visual assessment on its own. It becomes most useful when turning audit findings into concrete React, Tailwind, and shadcn/ui changes.

### 1.5 `audit-frontend-design`

**Assessment: A good alternative to Impeccable for code-centered audits.**

The [`audit-frontend-design` skill](https://github.com/sarveshsea/audit-frontend-design) targets React, Next.js, Tailwind, and shadcn. It examines accessibility, hierarchy, tokens, states, and responsive behavior.

Install it:

```bash
npx skills add sarveshsea/audit-frontend-design \
  --skill audit-frontend-design
```

The extended Memi variant requires inspecting the actual source tree first. It uses deterministic, file-specific checks and explicitly cautions against calling a screenshot review a pixel-level audit unless image analysis has actually occurred.

**Best for:** Design-token inconsistencies, source evidence, accessibility, responsive behavior, and verifiable implementation findings.

**Less suited to:** Creative art direction, visual originality, and alternative aesthetic concepts.

### 1.6 `ui-ux-pro-max`

**Assessment: Useful for exploring variants, but not as the sole reviewer.**

[`ui-ux-pro-max`](https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max) offers a searchable collection of UI styles, product patterns, palettes, font combinations, UX principles, chart types, and stack-specific guidance. It explicitly supports React, Tailwind, and shadcn/ui.

It can help with questions such as:

- “Show me three appropriate design directions.”
- “Which typography suits this product type?”
- “What alternatives are there to the usual SaaS dashboard?”
- “Create a small design system for a compact RPG web app.”

**Risk:** A large style catalog can encourage artificial *design by catalog*. Use it for ideas **after** the audit, not as the sole quality evaluator.

### 1.7 Screenshot-based Nielsen heuristic review

The [`ai-design-critique` project](https://github.com/aiuxmasters/ai-design-critique) sends a screenshot to Claude and generates a structured assessment based on Nielsen's ten usability heuristics. It is intended to report visible findings only, without speculating about interaction states that the screenshot cannot reveal.

Example:

```bash
npx @aiuxmasters/ai-design-critique review \
  --image screenshot.png \
  --focus "dashboard navigation and primary actions"
```

This requires an Anthropic API key, so it is not strictly free. However, its implementation is transparent, and the prompting approach can help with a custom audit.

---

## 2. Recommended combinations

### 2.1 Small, pragmatic setup

Install only **Impeccable** and the **shadcn/ui skill**. Then run:

```text
/impeccable init
/impeccable critique the dashboard
```

After reviewing and selecting actual findings, give the implementation agent a targeted instruction such as:

```text
Implement only findings C-01, C-03 and C-05.
Use the existing shadcn components and design tokens.
```

The finding IDs are illustrative; replace them with IDs from the actual audit. This lightweight setup may already be sufficient.

### 2.2 Thorough setup

Use four separate passes:

1. **Impeccable `critique`:** overall impression, usability, hierarchy, and priorities.
2. **Vercel `web-design-guidelines`:** rule-based checks with specific code locations.
3. **Anthropic `frontend-design`:** creativity, art direction, and avoidance of generic AI patterns.
4. **shadcn/ui:** practical implementation within the existing stack.

Do not install ten overlapping design skills at once. An agent may otherwise oscillate between conflicting rules about cards, spacing, typography, minimalism, and visual expressiveness.

---

## 3. A useful scoring framework

An overall rating such as “Design: 7.4/10” conveys little. Instead, assess distinct dimensions using explicit scoring anchors.

### 3.1 Recommended dimensions

1. Information architecture
2. Visual hierarchy
3. Layout and composition
4. Spacing and rhythm
5. Typography
6. Color and contrast
7. Interaction clarity
8. Consistency
9. Responsive design
10. Accessibility
11. Visual distinctiveness
12. Task efficiency

### 3.2 Scoring scale

| Score | Interpretation                                                                    |
| ----- | --------------------------------------------------------------------------------- |
| 1–2   | Fundamentally problematic                                                         |
| 3–4   | Multiple substantial weaknesses                                                   |
| 5–6   | Functional but clearly in need of improvement                                     |
| 7–8   | Good and mostly intentional design                                                |
| 9     | Exceptionally consistent and effective                                            |
| 10    | Reference-level quality for this particular product type, not absolute perfection |

Each rating should include **a score, supporting evidence, justification, confidence level, and the most important improvement**. Mark dimensions as provisional or unscored when evidence is insufficient.

Research on UICrit indicates that automated LLM evaluation has not yet reached the level of human designers. The study collected 3,059 critiques of 983 mobile UIs; targeted examples and visual prompting improved generated feedback quality by 55%. This supports structured rubrics, real examples, and screenshots over a vague “rate my design” prompt. The reported improvement should not be interpreted as proof that AI reviews match human expert evaluations.

---

## 4. Prompt for a coding agent with repository access

This prompt is intended for an agent that can inspect the repository, a running application, and screenshots. It must audit **before** making any changes. Copy the following prompt as a standalone instruction.

````markdown
# UI/UX Design Audit

Audit the existing design and layout of this application before changing any code.

## Product and stack

- Stack: React, Tailwind CSS, shadcn/ui, Lucide

- Product: [DESCRIBE THE PRODUCT]

- Primary users: [DESCRIBE THE USERS]

- Primary user tasks: [LIST THE MAIN TASKS]

- Desired character: [FOR EXAMPLE: compact, functional, distinctive, calm]

- Current concerns:

  - parts of the UI may be unnecessarily complicated

  - the visual design may feel too generic or boring

  - the layout may not use space effectively

  - the design may lack a distinctive visual idea

Preserve existing functionality. Do not introduce another component library.

## Evidence to inspect

1. Read the relevant repository instructions.

2. Inspect:

   - `components.json`

   - global CSS

   - theme and design tokens

   - Tailwind configuration, if present

   - app shell and layout components

   - navigation components

   - shared UI components

   - relevant routes and pages

3. Run the application and inspect the rendered UI if browser access is available.

4. Use the supplied screenshots or recordings.

5. Inspect at least these viewport classes:

   - desktop

   - tablet

   - mobile

6. Clearly distinguish:

   - verified source-code evidence

   - verified rendered evidence

   - reasonable inference

   - unknown information

Do not claim to have visually inspected the rendered UI unless the page or screenshots were actually inspected.

## Audit perspectives

Evaluate the application from these perspectives:

### A. Product and task design

- Is the primary task immediately understandable?

- Are primary, secondary, and destructive actions distinguishable?

- Is the user guided toward the next meaningful action?

- Are workflows unnecessarily complicated?

- Are information and controls disclosed at the appropriate time?

- Are empty, loading, error, success, and partial-data states useful?

### B. Information architecture

- navigation structure

- labels and terminology

- grouping and ordering

- orientation within the application

- depth and complexity

- redundant sections or controls

### C. Visual hierarchy

- scan path

- emphasis

- primary-action prominence

- heading hierarchy

- grouping and proximity

- foreground/background relationships

- competition between components

### D. Layout and composition

- grid and alignment

- container width

- page proportions

- section rhythm

- whitespace

- density

- balance

- responsive transitions

- use of available screen space

### E. Typography

- type scale

- weight hierarchy

- line height

- line length

- readability

- label styles

- consistency

- whether typography contributes to the product's character

### F. Color and visual styling

- semantic color roles

- contrast

- theme consistency

- dark mode

- border, radius and shadow policy

- decorative styling without functional purpose

- visual differentiation of states

### G. Components and interaction

- correct shadcn/ui component choice

- component composition

- repeated patterns

- button hierarchy

- forms

- dialogs and overlays

- tables and data displays

- hover, focus, active, selected and disabled states

- keyboard interaction

- touch-target sizing

### H. Icons

- consistent Lucide usage

- icon size and stroke consistency

- recognizable meaning

- redundant icons

- icons used without accessible labels

- icons that add decoration but no information

### I. Distinctiveness and creativity

Identify signs of generic AI-generated UI, including:

- every section placed inside a rounded card

- identical radius and shadow everywhere

- excessive badges or pills

- arbitrary gradients

- decorative icons without purpose

- repeated three-column feature layouts

- weak typography

- generic dashboard composition

- excessive all-caps labels

- unnecessary eyebrow labels

- animation applied uniformly rather than intentionally

Assess whether the interface has a product-specific visual idea.

### J. Accessibility

Review against WCAG 2.2 AA where the available evidence permits:

- semantic landmarks

- heading hierarchy

- accessible names

- labels and instructions

- keyboard navigation

- visible focus

- contrast

- non-color state indicators

- reduced motion

- target sizes

- zoom and reflow

## Scoring rubric

Assign a score from 1 to 10 for:

1. Information architecture

2. Visual hierarchy

3. Layout and composition

4. Spacing and rhythm

5. Typography

6. Color and contrast

7. Interaction clarity

8. Consistency

9. Responsive design

10. Accessibility

11. Visual distinctiveness

12. Task efficiency

For each score provide:

- score

- short justification

- concrete evidence

- confidence: high, medium or low

- the single most valuable improvement

Do not create false precision. If the evidence is insufficient, mark the category as provisional.

## Findings

Give each finding an ID. For every finding include:

- title

- category

- location:

  - route

  - screen region

  - component

  - file and line where identifiable

- evidence

- user or product impact

- recommendation

- implementation direction

- relevant shadcn/ui component or Tailwind pattern

- priority: critical, high, medium or low

- effort: small, medium or large

- confidence: high, medium or low

Separate findings into:

1. Objective defects

2. Strong design or usability concerns

3. Subjective stylistic opportunities

4. Missing evidence

## Alternative directions

Propose three materially different directions:

1. Conservative refinement

   - preserve the current character

   - simplify and improve hierarchy

2. Distinctive evolution

   - retain the product identity

   - introduce a stronger art direction

3. Structural redesign

   - reconsider layout and composition

   - preserve functionality and information

For each direction specify:

- design concept

- what changes

- what remains

- layout principles

- typography direction

- color usage

- component treatment

- icon treatment

- motion approach

- benefits

- risks

- estimated implementation scope

Avoid proposing three superficial color variations of the same design.

## Deliverables

Return:

1. Executive summary

2. Scorecard

3. Strengths to preserve

4. Prioritized findings

5. Quick wins achievable in roughly 15 to 60 minutes each

6. Structural improvements

7. Three alternative design directions

8. Recommended direction with reasoning

9. File-by-file implementation plan

10. Before/after verification checklist

Do not modify files during this audit.

Do not provide generic advice.

Do not redesign around trends without connecting the decision to the product and users.

````

---

## 5. Prompt for ChatGPT or an external vision model

This version assumes **no repository access**. The model should assess only what is visually observable and request code selectively afterward. Copy the following prompt as a standalone instruction.

````markdown
Act as a critical senior product designer and UI design director.

Review the attached screenshots or recordings of an existing web application.

## Context

- Stack: React, Tailwind CSS, shadcn/ui, Lucide

- Product: [DESCRIPTION]

- Primary users: [USERS]

- Primary tasks: [TASKS]

- Desired character: [CHARACTER]

- Current concerns:

  - the interface may be too complicated

  - the design may feel boring or generic

  - the layout may not use space effectively

  - the UI may lack creativity and a recognizable visual identity

You do not have access to the repository. Base visual conclusions only on the supplied material. Clearly label anything that cannot be verified without code or interaction.

## Review modes

Analyze the UI through five separate lenses:

1. Usability reviewer

   - clarity

   - task efficiency

   - navigation

   - cognitive load

   - error prevention

2. Visual designer

   - hierarchy

   - composition

   - typography

   - color

   - spacing

   - balance

3. Design-system reviewer

   - component consistency

   - tokens

   - repeated patterns

   - state consistency

   - probable design debt

4. Accessibility reviewer

   - visible contrast risks

   - hierarchy

   - target sizes

   - focus and state risks

   - color-only communication

5. Art director

   - distinctiveness

   - visual concept

   - product-specific character

   - generic AI-design patterns

   - opportunities for controlled creative risk

## Scoring

Score from 1 to 10:

- information architecture

- visual hierarchy

- layout and composition

- spacing and rhythm

- typography

- color and contrast

- interaction clarity

- consistency

- responsive design

- accessibility

- visual distinctiveness

- task efficiency

For every score provide:

- visible evidence

- reasoning

- confidence

- one concrete improvement

Do not create a score when the screenshot does not provide enough evidence.

## Findings

For every finding include:

- exact visible location

- observed problem

- why it matters

- concrete recommendation

- priority

- whether it is:

  - objectively visible

  - strongly reasoned

  - stylistic preference

Avoid generic advice such as "improve spacing" or "make it more modern."

Use measurable recommendations where appropriate.

## Alternatives

Propose three materially different visual directions:

1. simplified and functional

2. distinctive but restrained

3. more experimental and expressive

For each direction describe:

- layout changes

- typographic approach

- color roles

- component treatment

- icon treatment

- motion

- benefits

- risks

## Follow-up material

After the initial visual assessment, request only the source artifacts that would materially improve the analysis. Examples:

- `components.json`

- global CSS and theme tokens

- one relevant page component

- the app-shell component

- shared Card, Button or Navigation wrappers

- Tailwind configuration

- screenshots of mobile, loading, empty and error states

Do not assume interactive behavior from a static screenshot.

Do not recommend implementation changes until the visual audit is complete.

````

---

## 6. Screenshots and states to provide

A single desktop screenshot is insufficient. For each important route, provide:

- **Desktop:** approximately `1440 × 900`.
- **Tablet:** approximately `1024 × 768`.
- **Mobile:** approximately `390 × 844`.
- Navigation in both expanded and collapsed states.
- A normal state with data.
- Empty, loading, and error states.
- An open dialog or dropdown.
- Light and dark themes, if both are supported.

These viewport sizes are practical examples, not a substitute for testing the application's actual breakpoints.

For text-heavy interfaces, a restricted text column does not automatically waste space. For example, a Reddit discussion attributes the roughly 600–640-pixel ChatGPT text column to readability at approximately 70 characters per line. Wider displays do not necessarily require longer text lines.

---

## 7. Important limitations of AI design audits

### 7.1 AI is not a replacement for actual users

UX discussions rightly caution against presenting AI-generated personas or assumed user problems as genuine user research. An LLM can develop hypotheses and review questions, but cannot substitute for observed user behavior.

### 7.2 Screenshots do not reveal complete interaction behavior

A screenshot alone cannot establish:

- Keyboard operation.
- Focus order.
- Hover and active states.
- Loading behavior.
- Error messages that are not shown.
- Responsive breakpoint behavior.
- Screen-reader semantics.

Therefore, report visual findings separately from source-code and interaction findings. Even source inspection alone cannot confirm that all browser and assistive-technology interactions work as intended.

### 7.3 Not every design score is objective

“Typography: 8/10” is meaningful only with observable criteria. Creativity, brand fit, and aesthetic personality remain partly subjective. Separate objective defects, evidence-based design concerns, and stylistic opportunities.

---

## 8. Final recommendation and execution plan

Start with the following installation commands (select the package manager appropriate for your environment):

```bash
npx impeccable install
pnpm dlx skills add shadcn/ui
npx skills add https://github.com/vercel-labs/agent-skills \
  --skill web-design-guidelines
```

Then run:

```text
/impeccable init
/impeccable document
/impeccable critique the dashboard
```

Use the coding-agent prompt in **Section 4**, with these additional instructions:

```text
Use Impeccable critique for the primary visual and usability review.
Use web-design-guidelines for source-level verification.
Use the shadcn/ui skill only for stack-specific assessment.
Use frontend-design principles to identify generic or insufficiently distinctive visual choices.
Do not edit code.
```

**Important distinction:** The commands above install Impeccable, shadcn/ui, and Vercel's guidelines. The Anthropic `frontend-design` skill is discussed as an additional review perspective but is **not installed by these commands**; install or supply it separately if your agent needs to run that skill directly.

The process should produce four separate answers:

1. **What is not working?**
2. **Why is it not working?**
3. **Which creative directions are realistic?**
4. **How can the chosen direction be implemented cleanly with React, Tailwind, shadcn/ui, and Lucide?**

### Why the prompts are structured this way

The prompts distinguish verifiable defects from subjective preferences, require concrete evidence, and discourage premature code changes. Three genuinely different design directions also prevent an agent from simply producing a slightly cleaner version of the existing layout.
