# Sortie: Deep-Research Strategic Analysis

## 1. The Landscape: Sortie vs. The World

The AI job search space is incredibly crowded, but most tools cluster around solving the same two problems: *friction of applying* and *organization*. Here is how Sortie stacks up against the current market.

### **Direct Competitor: JobRight.ai**
*   **What they do well:** They have nailed the "copilot" workflow with a strong Chrome extension that autofills applications and matches candidates to jobs. They are user-friendly for active job seekers.
*   **Where they are weak:** They charge a premium (~$40/mo) for features that are becoming commoditized (autofill, generic AI text generation). Their AI can hallucinate, and they still operate somewhat in the "volume" mindset rather than deep intelligence. 
*   **Sortie's Edge:** Sortie is much deeper. JobRight gives you a matching score; Sortie gives you a 10-dimension letter grade, correctable skill tags, leadership dossiers, and insider connection paths. Sortie treats a job application like a strategic campaign, not a form to be filled.

### **The "Spray & Pray" Mass-Apply Bots (LazyApply, Sonara, LoopCV)**
*   **What they do:** Fully automated or semi-automated bulk applying.
*   **Where they fail:** High ban rates on platforms like LinkedIn/Greenhouse, massive drop in application quality, and they destroy user reputation. They cater to desperate, entry-level candidates.
*   **Sortie's Edge:** You have explicitly rejected this path. This is a massive positioning advantage. You can market Sortie as the "anti-spam" tool for serious professionals.

### **The Workflow Trackers (Teal, Simplify, Careerflow, Huntr)**
*   **What they do well:** Teal and Careerflow are essentially CRM boards (Kanban) with Chrome extensions to save jobs. Simplify dominates the new-grad market with its rapid autofill.
*   **Where they are weak:** They are glorified Trello boards with some AI sprinkled on top. They don't offer deep intelligence on *how* to win the job, they just help you track that you *applied* for it.
*   **Sortie's Edge:** They stop at tracking. Sortie starts at intelligence (company dossiers, leadership lookups). 

### **The ATS Resume Optimizers (Jobscan, Rezi, Kickresume)**
*   **What they do well:** Keyword matching and resume formatting to "beat the ATS." Jobscan is the legacy king here; Rezi is the modern AI equivalent.
*   **Where they are weak:** They are single-player, single-purpose tools. You use them, get your PDF, and leave. 
*   **Sortie's Edge:** Sortie integrates this into a holistic intelligence flow. The resume isn't just optimized for keywords; it's optimized based on the deep dossier and 10-dimension evaluation.

---

## 2. The White Space: Where Sortie Actually Stands Out

If you fight in the "Autofill" or "Kanban Board" space, you are fighting a losing battle against VC-funded incumbents with massive user bases (Simplify, Teal). 

**The Underserved Market: The "Sniper" (Mid-to-Senior Professionals)**
The current tools are built for the "Machine Gunner"—junior to mid-level employees trying to apply to 300 jobs a week. 

Staff Engineers, Product Managers, Directors, and Senior Designers don't apply to 300 jobs. They apply to 15. But those 15 applications need to be *flawless*. They need to know who the hiring manager is, what the company's Q3 goals are, and how to position their resume perfectly for that exact team.

**Sortie's positioning should be "Job Search Intelligence for High-Value Candidates."** 
You are building Palantir for job seekers, not another autofill extension. Your current features (dossiers, leadership lookup, insider connections, 10-dimension evaluation, required/preferred split) perfectly align with a candidate doing deep due diligence on a $150k+ role.

---

## 3. The Roadmap: What to Build vs. What to Skip

### 🔥 Features to BUILD

1.  **Chrome Extension (Intelligence, not Autofill)**
    *   *Reason:* Users shouldn't have to copy-paste URLs. The extension should inject the 10-dimension score and Insider Connections directly over LinkedIn/Indeed job postings as they browse.
2.  **Live Resume Editor Workspace (Not just a chat box)**
    *   *Reason:* Chat-based revisions are frustrating for formatting. Users need a live visual preview where they can accept/reject AI suggestions line-by-line with a "score-jump changelog" to gamify improvements.
3.  **"Warm Intro" CRM (Networking Tracker)**
    *   *Reason:* Since you have Insider Connections/Apify, build a lightweight CRM to track *conversations* with insiders, not just job applications. This is how senior roles are actually won.
4.  **Deep Interview Prep (Dossier-Fed)**
    *   *Reason:* You already generate the company dossier. Feed that dossier into a Gemini/Claude voice-mode or chat module to conduct mock interviews based on the *actual company context* and the *leadership team's background*.

### 🚫 Features to DELIBERATELY SKIP

1.  **Mass Auto-Apply / Autofill Scripts**
    *   *Reason:* It commoditizes the candidate, risks platform bans, and attracts low-value free-tier abusers who will drain your LLM API credits.
2.  **Generic AI Cover Letter Generator (1-click)**
    *   *Reason:* Recruiters instantly spot and toss generic AI cover letters. If you do cover letters, force them to be highly targeted using the company dossier and insider names.
3.  **A Native Job Board**
    *   *Reason:* The two-sided marketplace is a massive cash burn. Let LinkedIn and Indeed spend billions on acquiring listings; you just scrape and evaluate them.
4.  **Complex Kanban Sub-tasks**
    *   *Reason:* Teal already does this perfectly. Your Kanban should be dead simple (Saved -> Networking -> Applied -> Interviewing), focusing on *actionable intelligence* at each stage, not task management.

---

## 4. The Business Plan

### **Positioning & Messaging**
*   **Tagline:** "Stop applying. Start targeting." or "Intelligence for your next career move."
*   **The Narrative:** "The job market is broken by AI auto-apply bots. Recruiters are drowning in noise. To win, you don't need to send more applications; you need to send *better* ones. Sortie gives you the insider intelligence, precise skill matching, and targeted company dossiers to bypass the pile and get the interview."

### **Target Customer Segment**
*   **Who:** Mid-level to Senior Professionals (Tech, Marketing, Product, Design, Finance).
*   **Income Bracket:** Aiming for jobs paying $100k+.
*   **Psychographic:** Highly strategic, values their time, willing to pay for an edge, hates the "spray and pray" mentality.

### **Monetization Approach (Freemium -> Premium Intelligence)**
Do not charge for the Kanban board or basic job saving (Teal gives that away). Charge for API-heavy *intelligence*.
*   **Free Tier:** 
    *   Save unlimited jobs.
    *   Basic Kanban board.
    *   3 full Job Evaluations (10-dimension) per month.
    *   Basic resume matching (no generation).
*   **Sortie Pro ($19 - $29/mo):**
    *   Unlimited 10-dimension Job Evaluations.
    *   Unlimited Company Dossiers & Leadership Lookups.
    *   Full ATS Resume & Cover Letter generation workspace.
    *   *X* Insider Connection lookups per month (since Apify costs $0.31 each, bake this into the margin. E.g., 20 lookups/mo).
*   **A-la-carte "Intel Credits":** Let users top-up credits specifically for the expensive Apify lookups if they are heavy networkers.

### **The Durable Moat**
If JobRight or Teal wanted to, they could add a Jina Reader script tomorrow. Your moat cannot just be "we summarize the website."
Your durable moat is **The "Correctable" Data Graph.** 
Because your users are actively correcting the AI's skill extractions and grading, you are building a proprietary, human-verified dataset of *what skills actually map to what job titles and requirements in real-time*. Over time, Sortie's matching algorithm becomes objectively better than a generic LLM because it is fine-tuned on thousands of senior professionals correcting the model's assumptions. 

Additionally, your moat is your **Brand Stance**. By publicly rejecting mass-apply, you build a premium reputation. If recruiters know a candidate used Sortie, they know the candidate actually did their research. You want Sortie to be the "Anti-Spam" badge of honor.
