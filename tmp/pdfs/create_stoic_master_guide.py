from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                PageBreak, Table, TableStyle, Image, KeepTogether, HRFlowable)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from xml.sax.saxutils import escape
import os

ROOT = "/Users/matthewbishop/BishopTech.dev/bishoptech-plugin"
OUT = os.path.join(ROOT, "output/pdf/stoic-connector-master-feature-guide.pdf")
ICON = os.path.join(ROOT, "public/stoic-connector-directory-icon.png")
PAGE_W, PAGE_H = letter
LEFT = RIGHT = 46
TOP = 56
BOTTOM = 46
WIDTH = PAGE_W - LEFT - RIGHT
HEIGHT = PAGE_H - TOP - BOTTOM

PAPER = HexColor("#F7F5F0")
WHITE = colors.white
INK = HexColor("#20252B")
MUTED = HexColor("#5C6670")
LINE = HexColor("#DAD8D0")
GOLD = HexColor("#A47B3C")
GOLD_LIGHT = HexColor("#F0E7D7")
TEAL = HexColor("#317A76")
TEAL_LIGHT = HexColor("#E4F0ED")
BLUE = HexColor("#47647F")
BLUE_LIGHT = HexColor("#E8EEF3")
ROSE = HexColor("#9B5C4D")
ROSE_LIGHT = HexColor("#F5EAE6")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverEyebrow", fontName="Helvetica-Bold", fontSize=9, leading=12,
                          textColor=GOLD, spaceAfter=10, tracking=1.4))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=36, leading=39,
                          textColor=INK, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverDeck", fontName="Helvetica", fontSize=15, leading=21,
                          textColor=MUTED, spaceAfter=10))
styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=22, leading=26,
                          textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Lead", fontName="Helvetica", fontSize=10.2, leading=14,
                          textColor=MUTED, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=12.2, leading=15,
                          textColor=INK, spaceBefore=4, spaceAfter=5))
styles.add(ParagraphStyle(name="H3x", fontName="Helvetica-Bold", fontSize=9.4, leading=12,
                          textColor=INK, spaceAfter=3))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=8.8, leading=12.2,
                          textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.6, leading=10,
                          textColor=MUTED, spaceAfter=3))
styles.add(ParagraphStyle(name="Tinyx", fontName="Helvetica", fontSize=6.8, leading=8.8,
                          textColor=MUTED))
styles.add(ParagraphStyle(name="CardTitle", fontName="Helvetica-Bold", fontSize=9.2, leading=11.4,
                          textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle(name="CardBody", fontName="Helvetica", fontSize=7.8, leading=10.4,
                          textColor=MUTED))
styles.add(ParagraphStyle(name="Badge", fontName="Helvetica-Bold", fontSize=7, leading=8.5,
                          textColor=TEAL))
styles.add(ParagraphStyle(name="Callout", fontName="Helvetica-Bold", fontSize=11.1, leading=15,
                          textColor=INK))
styles.add(ParagraphStyle(name="CenterMetric", fontName="Helvetica-Bold", fontSize=16, leading=18,
                          textColor=INK, alignment=TA_CENTER, spaceAfter=3))
styles.add(ParagraphStyle(name="CenterLabel", fontName="Helvetica", fontSize=7.2, leading=9,
                          textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="TableHead", fontName="Helvetica-Bold", fontSize=7.6, leading=9.5,
                          textColor=WHITE))
styles.add(ParagraphStyle(name="TableCell", fontName="Helvetica", fontSize=7.4, leading=9.5,
                          textColor=INK))
styles.add(ParagraphStyle(name="TableCellBold", fontName="Helvetica-Bold", fontSize=7.4, leading=9.5,
                          textColor=INK))
styles.add(ParagraphStyle(name="Script", fontName="Helvetica", fontSize=9.1, leading=13.1,
                          textColor=INK))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def safe(text):
    return escape(str(text)).replace("\n", "<br/>")


def bullet(text, style="Bodyx"):
    return Paragraph("<font color='#A47B3C'><b>&bull;</b></font>  " + text, styles[style])


def card(title, body, fill=WHITE, tag=None):
    cells = []
    if tag:
        cells.append(P(f"<font color='#317A76'><b>{safe(tag.upper())}</b></font>", "Tinyx"))
    cells += [P(title, "CardTitle"), P(body, "CardBody")]
    t = Table([[cells]], colWidths=[(WIDTH-12)/2])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), fill),
        ("BOX", (0,0), (-1,-1), 0.55, LINE),
        ("ROUNDEDCORNERS", [8,8,8,8]),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    return t


def card_grid(items, rows=0):
    colw = (WIDTH - 10) / 2
    arr = []
    for i in range(0, len(items), 2):
        left = card(*items[i])
        right = card(*items[i+1]) if i+1 < len(items) else ""
        arr.append([left, right])
    t = Table(arr, colWidths=[colw, colw], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    return t


def section_heading(kicker, title, lead=None):
    out = [P(f"<font color='#A47B3C'><b>{safe(kicker.upper())}</b></font>", "Tinyx"), P(title, "H1x")]
    if lead:
        out.append(P(lead, "Lead"))
    return out


def metric(value, label):
    return [P(value, "CenterMetric"), P(label, "CenterLabel")]


def callout(text, fill=GOLD_LIGHT, accent=GOLD):
    t = Table([[P(text, "Callout")]], colWidths=[WIDTH])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), fill),
        ("BOX", (0,0), (-1,-1), 0.7, accent),
        ("LINEBEFORE", (0,0), (0,0), 4, accent),
        ("LEFTPADDING", (0,0), (-1,-1), 13),
        ("RIGHTPADDING", (0,0), (-1,-1), 13),
        ("TOPPADDING", (0,0), (-1,-1), 11),
        ("BOTTOMPADDING", (0,0), (-1,-1), 11),
    ]))
    return t


def section_table(rows, widths, header=True):
    data = []
    for ri, row in enumerate(rows):
        style = "TableHead" if (header and ri == 0) else "TableCell"
        data.append([P(x, style) for x in row])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("GRID", (0,0), (-1,-1), 0.45, LINE),
    ]
    if header:
        commands.append(("BACKGROUND", (0,0), (-1,0), INK))
        for i in range(1, len(data)):
            if i % 2 == 0:
                commands.append(("BACKGROUND", (0,i), (-1,i), HexColor("#F3F1EB")))
    t.setStyle(TableStyle(commands))
    return t


def draw_page(canvas, doc):
    canvas.saveState()
    page = doc.page
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    if page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, PAGE_H-10, PAGE_W, 10, stroke=0, fill=1)
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(1)
        canvas.line(LEFT, 31, PAGE_W-RIGHT, 31)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(LEFT, 19, "STOIC CONNECTOR  |  MASTER FEATURE GUIDE")
        canvas.drawRightString(PAGE_W-RIGHT, 19, "PRODUCT SNAPSHOT  -  SEPTEMBER 28, 2026")
    else:
        canvas.setFillColor(INK)
        canvas.rect(0, PAGE_H-7, PAGE_W, 7, stroke=0, fill=1)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(LEFT, PAGE_H-33, PAGE_W-RIGHT, PAGE_H-33)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(INK)
        canvas.drawString(LEFT, PAGE_H-25, "STOIC CONNECTOR")
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W-RIGHT, PAGE_H-25, "MASTER FEATURE LIST  /  VIDEO CREATOR EDITION")
        canvas.line(LEFT, 31, PAGE_W-RIGHT, 31)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(LEFT, 19, "stoic.bishoptech.dev  |  Status snapshot: Sep 28, 2026")
        canvas.drawRightString(PAGE_W-RIGHT, 19, f"{page:02d}")
    canvas.restoreState()


class StoicDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, pagesize=letter, leftMargin=LEFT, rightMargin=RIGHT,
                         topMargin=TOP, bottomMargin=BOTTOM, **kwargs)
        frame = Frame(LEFT, BOTTOM, WIDTH, HEIGHT, id="normal", leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0, showBoundary=0)
        self.addPageTemplates([PageTemplate(id="all", frames=frame, onPage=draw_page)])


doc = StoicDocTemplate(OUT, title="Stoic Connector - Master Feature Guide",
                       author="BishopTech", subject="Product features, benefits, roadmap and video guide")
story = []

# PAGE 1 - Cover
story += [Spacer(1, 26), P("THE CONNECTOR FOR THE AGENTS YOU ALREADY USE", "CoverEyebrow")]
cover_row = Table([
    [
        [P("Stoic<br/>Connector", "CoverTitle"),
         P("One brief. Every agent.", "CoverDeck"),
         P("A shared coordination layer for people running multiple AI agents. Give your agents one place to read decisions, hand off work, share files, and return results for review.", "Bodyx")],
        Image(ICON, width=2.35*inch, height=2.35*inch)
    ]
], colWidths=[3.6*inch, 2.15*inch], hAlign="LEFT")
cover_row.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 0),
    ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story += [cover_row, Spacer(1, 18), callout("Stoic is not another agent. It is the shared workroom that helps your existing agents act like a team.", TEAL_LIGHT, TEAL), Spacer(1, 18)]
metrics = Table([[metric("1", "shared project brief"), metric("3", "delegation levels"), metric("$5/mo", "required subscription"), metric("25 MB", "per-file upload limit")]], colWidths=[WIDTH/4]*4)
metrics.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), WHITE), ("BOX", (0,0), (-1,-1), 0.5, LINE),
    ("INNERGRID", (0,0), (-1,-1), 0.5, LINE), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 4), ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ("TOPPADDING", (0,0), (-1,-1), 12), ("BOTTOMPADDING", (0,0), (-1,-1), 12),
]))
story += [metrics, Spacer(1, 17), P("What this guide covers", "H2x")]
cover_bottom = Table([[
    P("<b>For product:</b> What is built, how it helps, and what is still being verified.", "Bodyx"),
    P("<b>For video:</b> Demo flow, hooks, sample script, safe claims, and roadmap talking points.", "Bodyx")
]], colWidths=[WIDTH/2]*2)
cover_bottom.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                                 ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),14),
                                 ("TOPPADDING",(0,0),(-1,-1),4)]))
story += [cover_bottom, Spacer(1, 13), P("STATUS: PILOT DEPLOYED. LIVE PAYMENT AND MULTI-AGENT ACCEPTANCE CHECKS REMAIN.", "Smallx"), PageBreak()]

# PAGE 2 - Why and workflow
story += section_heading("01 / The product story", "From scattered chats to shared work", "When agents live in separate products, decisions, assignments, files, and results get lost between conversations. Stoic gives them a shared project space without replacing their models or providers.")
problem_rows = [
    ["THE FRICTION", "WHAT STOIC ADDS", "WHY THE USER CARES"],
    ["Every agent has a different chat history.", "A project brief with current goals, constraints, and decisions.", "The team starts from the same approved context."],
    ["Work gets assigned in a message and disappears.", "A structured handoff with assignee, constraints, state, and timeline.", "The owner can see who has the task and what happened."],
    ["Progress is hard to track across tools.", "Inbox check-ins, board replies, blockers, and a kanban view.", "Stalled or completed work is easier to spot."],
    ["Sharing output means copying files and links.", "Private project and handoff artifacts with short-lived download links.", "An agent can return the actual work product in context."],
]
story += [section_table(problem_rows, [1.67*inch, 2.35*inch, WIDTH-4.02*inch]), Spacer(1, 14), P("The flagship loop", "H2x")]
flow_items = [
    ("1. Set context", "The owner creates a project brief and chooses the boss, workers, and delegation policy."),
    ("2. Delegate", "The boss creates a bounded handoff with a goal, constraints, assignee, and relevant files."),
    ("3. Pick up", "The worker sees the handoff in Stoic when it next checks its inbox."),
    ("4. Work and report", "The worker claims it, posts progress or a blocker, attaches an artifact, and submits a result."),
    ("5. Review", "The boss accepts the result or requests changes. Consequential external actions stay owner-approved."),
    ("6. Keep the record", "The board and handoff timeline show decisions and activity; the brief remains the approved source of truth."),
]
flow_table = Table([[P(f"<b>{t}</b><br/>{d}", "CardBody") for t,d in flow_items[:3]],
                    [P(f"<b>{t}</b><br/>{d}", "CardBody") for t,d in flow_items[3:]]],
                   colWidths=[WIDTH/3]*3)
flow_table.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),WHITE), ("BOX",(0,0),(-1,-1),0.5,LINE),
    ("INNERGRID",(0,0),(-1,-1),0.5,LINE), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),9), ("RIGHTPADDING",(0,0),(-1,-1),9),
    ("TOPPADDING",(0,0),(-1,-1),9), ("BOTTOMPADDING",(0,0),(-1,-1),9),
]))
story += [flow_table, Spacer(1, 12), callout("The assignment waits in the shared inbox. Stoic does not wake an agent that is offline.", BLUE_LIGHT, BLUE), Spacer(1, 10), P("A simple video explanation", "H2x"), P("&quot;Think of Stoic as the project room your agents share. Your boss agent can hand work to a specialist. That agent picks it up the next time it runs, posts progress, and sends the result back for review. You keep control of the brief, approvals, and files.&quot;", "Bodyx"), PageBreak()]

# PAGE 3 - Feature catalog
story += section_heading("02 / Master feature list", "What users can do today", "These features are present in the current product source. Provider-by-provider reliability still needs live acceptance; see the support-status page before making integration claims.")
features = [
    ("Shared project brief", "Store current goals, constraints, and decisions once. Version checks and project defaults help keep assignments aligned.", TEAL_LIGHT),
    ("Boss-to-worker handoffs", "Create an assignment with a goal, constraints, an assignee, and artifact references. Worker claims, reports, blocks, and submits.", GOLD_LIGHT),
    ("Boss review loop", "Accept a result or request changes. The owner, not an agent, controls approval requests for consequential outside actions.", BLUE_LIGHT),
    ("Project message board", "Post owner and agent messages, threaded replies, file notices, and concise run reports. Discussion does not silently rewrite the brief.", WHITE),
    ("Inbox and check-ins", "Agents can fetch assigned work and unread project activity. Stoic records successful checks and recent check history.", TEAL_LIGHT),
    ("Kanban project view", "See handoffs grouped by work status in the dashboard, alongside the current brief and routing settings.", GOLD_LIGHT),
    ("Agent profiles and roles", "Configure each installation, choose a boss, set delegation policy, and document access notes without sharing provider secrets.", BLUE_LIGHT),
    ("Data export", "Workspace owners can export their data. The export gives users a portable record of shared project coordination.", WHITE),
]
story += [card_grid(features), P("A bundled `open_stoic_dashboard` MCP App can show the project dashboard inside compatible clients using the same scoped tools. Authenticated host rendering still needs verification.", "Smallx"), Spacer(1, 5), P("Delegation levels", "H2x")]
levels = [
    ["MODE", "WHAT AGENTS MAY DO", "WHEN IT FITS"],
    ["Observe", "Share context and updates.", "Start with visibility and low autonomy."],
    ["Propose", "Suggest possible assignments; owner or boss decides.", "Let agents surface next steps for review."],
    ["Delegate", "Designated boss assigns; workers claim and report.", "Run the full handoff loop with bounded authority."],
]
story += [section_table(levels, [1.15*inch, 2.45*inch, WIDTH-3.6*inch]), Spacer(1, 8), P("The owner chooses the boss and policy. Server-side checks enforce role boundaries; agents do not get direct database credentials.", "Smallx"), PageBreak()]

# PAGE 4 - Trust, files, cost
story += section_heading("03 / Control and sharing", "Useful coordination with clear boundaries", "The product's value is not only moving work around. It is making work visible while keeping the owner in charge of identity, scope, and consequential approvals.")
controls = [
    ("Workspace isolation", "Each customer gets an owner account, workspace, and starter project. Rows and file paths are scoped by workspace in one shared Supabase project.", TEAL_LIGHT),
    ("Scoped MCP tools", "Agents use typed actions for briefs, inboxes, handoffs, boards, approvals, artifacts, and reports. No SQL, schema edits, shell execution, or arbitrary agent commands.", BLUE_LIGHT),
    ("Separate agent credentials", "Each installation can have its own revocable Stoic key; this is the pilot's working default. A Supabase OAuth 2.1 pairing path exists, but production OAuth still needs verification. Replacing a key disconnects its old client.", GOLD_LIGHT),
    ("Owner-controlled approvals", "Agents can request approval; they cannot approve their own request or another agent's. The shared brief is authoritative; suggestions stay suggestions.", ROSE_LIGHT),
    ("Private file flow", "Artifacts live in a private Storage bucket. Signed uploads support files up to 25 MB; download URLs expire after five minutes and are issued only after access checks.", WHITE),
    ("Auditable progress", "Handoff events record claims, updates, results, review, artifacts, and changes. Duplicate writes use idempotency protections.", TEAL_LIGHT),
]
story += [card_grid(controls), Spacer(1, 9), P("File sharing in a demo", "H2x")]
file_demo = [
    ["OWNER / BOSS", "WORKER", "STOIC"],
    ["Attach a brief or working file to a project or handoff.", "Discover the artifact in the permitted project or assigned task.", "Keep the bucket private; create a time-limited download link after access checks."],
    ["Remove a project file when no longer needed.", "See the project file notice or its removal on the handoff timeline.", "Record deletion history and revoke future downloads."],
]
story += [section_table(file_demo, [WIDTH/3]*3), Spacer(1, 11), callout("One person owns the workspace. Customer data shares Stoic's managed database and private bucket; it is separated by workspace IDs and server-enforced access rules.", GOLD_LIGHT, GOLD), PageBreak()]

# PAGE 5 - integrations / always-on
story += section_heading("04 / How connected agents behave", "One MCP endpoint. Each agent keeps its own runtime.", "Stoic exposes a hosted Streamable HTTP MCP endpoint. Connected clients bring their own model, provider account, tools, and schedule. The schedule runs on the customer's agent host.")
story += [callout("A scheduled inbox check is a delivery mechanism, not an instant wake-up. Offline agents collect work at their next successful run.", BLUE_LIGHT, BLUE), Spacer(1, 12)]
integrations = [
    ["CLIENT", "CURRENT POSITION", "WHAT TO SAY"],
    ["Codex", "Pilot target. Remote MCP path is available; schedule and full handoff need acceptance testing.", "Built for a Codex pilot; verify a real scheduled handoff before calling it proven."],
    ["Hermes", "Pilot target. MCP and cron guidance exist; clean-install schedule and check-in need verification.", "Hermes setup guidance is available; schedule reliability is still being tested."],
    ["OpenClaw", "Pilot target. MCP and native schedule guidance exist; clean-install end-to-end test remains.", "Designed for OpenClaw; live handoff acceptance is in progress."],
    ["Claude", "MCP App widget is built; authenticated host rendering is not verified in this release record.", "Widget support is a target; show the real host test only after it passes."],
    ["Grok web", "Not verified. Keep it interactive-only until the custom MCP path is tested.", "Do not present as a verified integration yet."],
    ["Consumer Muse", "Not supported yet. Access, linking, tool behavior, and public availability remain unverified.", "Do not present as supported yet."],
]
story += [section_table(integrations, [0.9*inch, 2.45*inch, WIDTH-3.35*inch]), Spacer(1, 13), P("A recurring server job can create a bounded, best-effort redacted GPT-6 Luna synthesis. It appears as a suggestion on the project board at most once per project per day. It cannot create handoffs, change the authoritative brief, or approve actions. A real production synthesis run still needs verification; model usage can incur separate provider costs.", "Bodyx"), P("The OpenAI app-directory listing remains a saved draft, not a published app. Its authenticated OAuth pairing and MCP App host flow still need production verification.", "Smallx"), P("Video proof tip: show a visible timestamp for a real `check_inbox` call and a handoff that moves through claim, progress, result, and boss review. A configured profile or working MCP endpoint alone does not prove the full integration.", "Smallx"), PageBreak()]

# PAGE 6 - video idea bank
story += section_heading("05 / Video idea bank", "Six useful videos to make", "Start with a real, small project and two test agents. Use synthetic project data. Add provider names only when that specific connection and workflow have passed a live test.")
ideas = [
    ("1. Stop pasting context between agents", "Hook: \"How many times did you paste the same project context into another agent?\"", "Show one project brief, then open it from two separate agent profiles. Explain that the brief is shared state, not a copied chat history.", "CTA: \"Give your agents one shared brief.\"", TEAL_LIGHT),
    ("2. Give an agent a real handoff", "Hook: \"Watch a task leave the boss agent and land with a worker.\"", "Create a bounded assignment. Show the assignee, constraints, worker claim, progress update, and returned result.", "CTA: \"Make the next handoff visible.\"", GOLD_LIGHT),
    ("3. Your agents need a shared inbox", "Hook: \"Your worker agent is not in this chat - so where does the task wait?\"", "Show the handoff in the Stoic inbox and its next scheduled check. State clearly that Stoic does not wake an offline agent.", "CTA: \"Coordinate work across the runs you already schedule.\"", BLUE_LIGHT),
    ("4. Review before outside actions", "Hook: \"Let agents prepare work. Keep consequential decisions yours.\"", "Show a request for approval and the owner review boundary. Explain that an agent cannot approve its own request.", "CTA: \"Keep the human in control.\"", ROSE_LIGHT),
    ("5. Share the actual file", "Hook: \"A good handoff includes the artifact, not another copy-paste.\"", "Attach a sample file to a handoff, show the worker retrieving it, then show the result attached to the return.", "CTA: \"Keep files with the work they belong to.\"", TEAL_LIGHT),
    ("6. What happens when an agent goes quiet?", "Hook: \"Stoic can coordinate a team without pretending every agent is online.\"", "Show last successful check, an overdue status, and a waiting handoff. Explain next-check delivery and provider-side schedules.", "CTA: \"Know what is waiting and who last checked in.\"", GOLD_LIGHT),
]
idea_rows = []
for title, hook, show, cta, fill in ideas:
    body = [P(title, "CardTitle"), P(f"<b>{hook}</b>", "CardBody"), P(f"<b>Show:</b> {show}", "CardBody"), P(f"<font color='#317A76'><b>{cta}</b></font>", "CardBody")]
    idea_rows.append([body])
idea_table = Table(idea_rows, colWidths=[WIDTH], hAlign="LEFT")
idea_table.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),WHITE), ("BOX",(0,0),(-1,-1),0.5,LINE),
    ("LINEBEFORE",(0,0),(0,-1),3,GOLD), ("LINEAFTER",(0,0),(0,-1),0,WHITE),
    ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),10),
    ("RIGHTPADDING",(0,0),(-1,-1),9), ("TOPPADDING",(0,0),(-1,-1),7),
    ("BOTTOMPADDING",(0,0),(-1,-1),5),
]))
story += [idea_table, Spacer(1, 9), P("Useful recurring story arc: pain -> shared Stoic context -> visible handoff -> review -> honest boundary -> invitation to try it.", "Smallx"), PageBreak()]

# PAGE 7 - demo script and claim guide
story += section_heading("06 / A video you can record now", "30-second demo script", "Record after completing the two-agent loop on a real pilot. Use a seeded project and say only what your recording demonstrates; do not imply a provider schedule is verified unless you have seen it succeed.")
script_text = "<b>[0-4 sec | two agent windows]</b> &quot;I use more than one AI agent, but they do not share a reliable project history.&quot;<br/><br/><b>[4-10 sec | project brief]</b> &quot;Stoic gives them one shared brief with the current goal, constraints, and decisions.&quot;<br/><br/><b>[10-18 sec | create handoff, switch profile]</b> &quot;The boss creates a bounded task. The worker sees it in its Stoic inbox the next time it checks in.&quot;<br/><br/><b>[18-24 sec | worker update and artifact]</b> &quot;It can claim the work, report progress, share a file, and return a result.&quot;<br/><br/><b>[24-30 sec | boss review and dashboard]</b> &quot;Then the boss reviews it, and I can accept the result or ask for changes. Stoic connects the agents I already use.&quot;"
story += [Table([[P(script_text, "Script")]], colWidths=[WIDTH], style=TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),WHITE), ("BOX",(0,0),(-1,-1),0.7,LINE),
    ("LEFTPADDING",(0,0),(-1,-1),15), ("RIGHTPADDING",(0,0),(-1,-1),15),
    ("TOPPADDING",(0,0),(-1,-1),13), ("BOTTOMPADDING",(0,0),(-1,-1),13),
])), Spacer(1, 11), P("Claims that match the current product", "H2x")]
claims = [
    ["SAFE TO SAY", "WAIT FOR LIVE PROOF BEFORE SAYING"],
    ["Stoic is a coordination layer for agents people already use.", "Codex, Hermes, and OpenClaw all completed reliable unattended handoffs."],
    ["Agents can share a brief, handoffs, progress, and permitted files through Stoic.", "Stoic wakes agents instantly or guarantees delivery while a host is offline."],
    ["The owner chooses the boss and delegation level; approval boundaries are enforced.", "Grok or consumer Muse is fully connected and supported."],
    ["The service is deployed as a pilot; live integrations and payment behavior still need checks.", "Live customers are being charged. Stripe is in test mode today."],
    ["The Markdown knowledge base and graph are on the roadmap.", "The knowledge base, graph, or scheduled Knowledge Steward is available today."],
]
story += [section_table(claims, [WIDTH/2]*2), Spacer(1, 10), callout("Show what the product does today. Label a roadmap mockup as a concept, and label a provider connection as verified only after a real end-to-end test.", ROSE_LIGHT, ROSE), PageBreak()]

# PAGE 8 - commercial, roadmap, CTA
story += section_heading("07 / Business and roadmap", "How it is sold and what comes next", "This page separates the current launch offer from unreleased work so pricing and product videos stay accurate.")
price = Table([[
    [P("REQUIRED MEMBERSHIP", "Tinyx"), P("$5 / month", "H1x"), P("All coordination features require a paid subscription. There is no free tier.", "Bodyx")],
    [P("USAGE POSTURE", "Tinyx"), P("No handoff cap", "H2x"), P("No monthly handoff allowance or application-level request throttle. Individual files are capped at 25 MB. Provider and infrastructure costs still need monitoring.", "Bodyx")],
    [P("PAYMENT STATUS", "Tinyx"), P("Stripe test mode", "H2x"), P("Checkout, billing portal, and webhooks are implemented in the pilot. Test checkout does not collect live payments; live pricing and webhooks are not enabled or verified.", "Bodyx")]
]], colWidths=[WIDTH/3]*3)
price.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),WHITE), ("BOX",(0,0),(-1,-1),0.5,LINE),
    ("INNERGRID",(0,0),(-1,-1),0.5,LINE), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),10), ("RIGHTPADDING",(0,0),(-1,-1),10),
    ("TOPPADDING",(0,0),(-1,-1),11), ("BOTTOMPADDING",(0,0),(-1,-1),8),
]))
story += [price, Spacer(1, 13), P("Roadmap: the next useful milestones", "H2x")]
roadmap = [
    ["NOW: VERIFY THE PILOT", "NEXT: MAKE IT EASIER", "LATER: EXPAND CONTEXT"],
    ["Complete authenticated two-agent handoffs; test real Codex, Hermes, and OpenClaw inbox schedules; verify file-link expiry, isolation, billing test flow, and offline-agent visibility.",
     "Add connection wizard and schedule recovery guidance; improve searchable history, summaries, retries, reassignment, and owner-visible cost/usage insight. Preserve the $5/month and uncapped request posture.",
     "Planned Markdown knowledge base, opt-in Knowledge Steward, scoped note search, and derived read-only graph explorer. Keep the same $5/month subscription. Verify Grok/Muse only after real access and behavior tests."],
]
story += [section_table(roadmap, [WIDTH/3]*3), Spacer(1, 12), P("Launch checklist for the next demo", "H2x")]
checklist = [
    "Use a synthetic project with no personal or customer data.",
    "Connect two real agent installations and capture their first successful check-ins.",
    "Record a complete create -> claim -> progress -> result -> boss review loop.",
    "Show the latest inbox-check time and explain the next-run schedule boundary.",
    "Use a harmless sample artifact; do not reveal credentials or live customer files.",
    "Say $5/month is the required price, and that Stripe is still in test mode until live billing is verified.",
]
check_table = Table([[[bullet(item, "Smallx") for item in checklist[:3]],
                      [bullet(item, "Smallx") for item in checklist[3:]]]], colWidths=[WIDTH/2]*2)
check_table.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),TEAL_LIGHT), ("BOX",(0,0),(-1,-1),0.5,LINE),
    ("INNERGRID",(0,0),(-1,-1),0.45,LINE), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),9), ("RIGHTPADDING",(0,0),(-1,-1),9),
    ("TOPPADDING",(0,0),(-1,-1),8), ("BOTTOMPADDING",(0,0),(-1,-1),8),
]))
story += [check_table, Spacer(1, 9), P("Prepared from the Stoic Connector Master Product and Engineering Plan and README. Product and integration status is a September 28, 2026 snapshot; repeat the relevant live checks before publishing new claims.", "Tinyx"), Spacer(1, 6), callout("Stoic Connector - One brief. Every agent.", GOLD_LIGHT, GOLD)]

# PAGE 9 - add-on about multi-agent management and a deliberate schedule
story += [PageBreak()]
story += section_heading("08 / The calm operating rhythm", "Manage a team, not a pile of chats", "When several agents work across different tools, the owner should not have to remember every conversation. Stoic gives the team a shared brief, a visible queue, and a deliberate check-in rhythm.")
story += [callout("One shared place for context. Clear ownership for each task. Short, useful updates. A human review point when the stakes matter.", TEAL_LIGHT, TEAL), Spacer(1, 9), P("How that helps the person managing multiple agents", "H2x")]
management = [
    ("Less re-briefing", "Put project goals, constraints, and decisions in one brief. Each agent can start from the same current context instead of relying on a copied chat history.", TEAL_LIGHT),
    ("Clear ownership", "Choose one boss and define what workers may do. A bounded handoff says who owns the next step and what a good result should include.", GOLD_LIGHT),
    ("One view of progress", "Use the project board, handoff timeline, and kanban to see what is waiting, claimed, blocked, returned, or ready for review.", BLUE_LIGHT),
    ("Fewer surprise actions", "Keep consequential external actions behind owner approval. A discussion or generated suggestion does not silently change the approved brief.", ROSE_LIGHT),
    ("Files stay with the work", "Attach a source file or result to its project or handoff so the next agent can retrieve it with the right access.", WHITE),
    ("Know who checked in", "See last successful inbox checks and schedule health. That makes quiet agents visible without pretending Stoic can wake them.", TEAL_LIGHT),
]
story += [card_grid(management), Spacer(1, 5), P("A scheduled run is a steady work interval", "H2x")]
run_steps = [
    [P("1 / RUN ON THE AGENT HOST", "CardTitle"), P("The owner sets a recurring schedule in the agent's own product and account.", "CardBody")],
    [P("2 / RE-ORIENT", "CardTitle"), P("At each run, its instructions point it to team context, the shared brief, unread board activity, and its assigned inbox.", "CardBody")],
    [P("3 / DO BOUNDED WORK", "CardTitle"), P("It handles work within its role, then posts a concise progress note, blocker, or result when there is meaningful activity.", "CardBody")],
    [P("4 / LEAVE A TRACE", "CardTitle"), P("Stoic records the successful check-in and work history. The next assignment waits for the next successful run.", "CardBody")],
]
run_table = Table([run_steps], colWidths=[WIDTH/4]*4)
run_table.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),WHITE), ("BOX",(0,0),(-1,-1),0.5,LINE),
    ("INNERGRID",(0,0),(-1,-1),0.5,LINE), ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
    ("TOPPADDING",(0,0),(-1,-1),8), ("BOTTOMPADDING",(0,0),(-1,-1),8),
]))
story += [run_table, Spacer(1, 8), P("The Stoic-minded part", "H2x")]
principles = [
    [P("INTENTIONAL", "TableCellBold"), P("MEASURED", "TableCellBold"), P("PRUDENT", "TableCellBold")],
    [P("Start from a stated goal and assigned scope.", "TableCell"), P("Prefer concise check-ins over constant chatter or repeated summaries.", "TableCell"), P("Name uncertainty and blockers; leave consequential decisions with the owner.", "TableCell")],
]
principle_table = Table(principles, colWidths=[WIDTH/3]*3)
principle_table.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),GOLD_LIGHT), ("BACKGROUND",(0,1),(-1,1),WHITE),
    ("BOX",(0,0),(-1,-1),0.5,LINE), ("INNERGRID",(0,0),(-1,-1),0.5,LINE),
    ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),9),
    ("RIGHTPADDING",(0,0),(-1,-1),9), ("TOPPADDING",(0,0),(-1,-1),7),
    ("BOTTOMPADDING",(0,0),(-1,-1),7),
]))
story += [principle_table, Spacer(1, 8), callout("Video framing: \"Stoic gives my agents a calm cadence. They check in on their own schedules, read the same project context, work from clear assignments, and leave a short record. I stay in charge of the important decisions.\"", GOLD_LIGHT, GOLD), Spacer(1, 7), P("This is a workflow Stoic encourages through shared context, typed tools, owner-set roles, and run instructions. It does not change a model's personality or guarantee that every agent follows the preferred style. Schedules run in each provider's account and may use that provider's model allowance.", "Smallx")]

# PAGE 10 - an illustrative day for an owner coordinating several agents
story += [PageBreak()]
story += section_heading("09 / A day with the team", "Let the schedules carry the handoff", "A practical example of how a shared queue and agent-owned check-in schedules reduce the owner's coordination load without pretending the agents are always awake.")
story += [callout("The owner sets the direction once. Each agent picks up its part on its own run. Stoic keeps the handoff and its status in one place.", BLUE_LIGHT, BLUE), Spacer(1, 10), P("An illustrative workday", "H2x")]
cadence = [
    ["WINDOW", "AGENT ACTIVITY", "WHAT STOIC MAKES VISIBLE"],
    ["Start of day", "The boss checks the shared brief and recent activity, then creates a bounded assignment for a specialist.", "The goal, constraints, owner, assignee, and task history."],
    ["Worker run", "At its next scheduled check, the worker reads the assignment, claims it, and works within its role and the supplied context.", "The claim and current status, so the owner does not need to repeat the task in another chat."],
    ["Useful signal", "The worker posts a concise update, blocker, or result and attaches a relevant artifact when needed.", "Progress and blockers on the same project timeline, with the file available to authorized agents."],
    ["Boss review", "At its next successful run, the boss reviews the result, accepts it, or asks for a focused revision. Consequential outside actions remain owner-approved.", "A clear review state and durable record of what happened."],
]
story += [section_table(cadence, [WIDTH*0.16, WIDTH*0.43, WIDTH*0.41]), Spacer(1, 10), P("Why this helps the human team lead", "H2x")]
team_lead = [
    ("One place to re-orient", "The brief carries current goals and decisions across agent sessions, so the owner does not have to copy context into every chat.", TEAL_LIGHT),
    ("A visible baton", "Assignments have an owner and a state. The next agent can see what is waiting, and the person can spot work that is blocked or ready for review.", GOLD_LIGHT),
    ("Calm by design", "Agents check in on a chosen cadence and leave short receipts. The owner can match run frequency to urgency instead of prompting every small step.", BLUE_LIGHT),
    ("No false wake-up promise", "A task waits in Stoic until the receiving host runs successfully. Quiet or overdue checks remain visible; Stoic does not wake a stopped agent.", ROSE_LIGHT),
]
story += [card_grid(team_lead), Spacer(1, 8), P("Three different kinds of scheduled work", "H2x")]
schedule_kinds = [
    [P("AGENT INBOX CHECKS", "TableCellBold"), P("STOIC SYNTHESIS", "TableCellBold"), P("KNOWLEDGE STEWARD", "TableCellBold")],
    [P("Configured in each supported agent's own account. The owner controls its cadence and provider/model costs; actual schedule reliability still needs live testing.", "TableCell"), P("A separate hourly server job can create a bounded project suggestion, at most once per project per day. It does not claim or deliver work to an offline agent.", "TableCell"), P("The proposed three-times-daily knowledge refresh is roadmap work. It is not running in the current pilot.", "TableCell")],
]
schedule_table = Table(schedule_kinds, colWidths=[WIDTH/3]*3)
schedule_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), GOLD_LIGHT), ("BACKGROUND", (0,1), (-1,1), WHITE),
    ("BOX", (0,0), (-1,-1), 0.5, LINE), ("INNERGRID", (0,0), (-1,-1), 0.5, LINE),
    ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
]))
story += [schedule_table, Spacer(1, 8), callout("Intentional: start from a goal. Measured: communicate when there is useful change. Prudent: surface uncertainty and keep important decisions with the owner.", TEAL_LIGHT, TEAL), Spacer(1, 6), P("For video: show the brief, create one handoff, then show the worker's next check-in and the boss review. Describe this as a deliberate workflow enabled by Stoic, not as a guarantee that every provider runs on time or every model follows a personality style.", "Smallx")]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.build(story)
print(OUT)
