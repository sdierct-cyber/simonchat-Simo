"""In-chat instructions tied to Simo's current controls."""

import re


HELP_REQUEST_PATTERN = (
    r"^(?:simo[, ]+)?(?:please\s+)?(?:(?:can|could|would) you\s+)?"
    r"(?:how (?:do|can|should|would) (?:i|we|users|people)\b|how to\b|"
    r"(?:show|tell|teach) me how\b|walk me through\b|"
    r"help me (?:use|learn|understand|find)\b|instructions for\b)"
)

# Put specific tasks before the broader workspace entries.
_GUIDES = (
    ("Font and appearance", r"\b(?:fonts?|typography|themes?|accent colou?r|appearance)\b", (
        "Open **Settings & Voice** in the sidebar.",
        "Under **Font**, choose a style to preview it. Theme and Accent control the colors.",
        "Click **Save** to keep the selection in this browser.",
    )),
    ("Microphone", r"\b(?:microphone|mic|dictat\w*|voice.to.text)\b", (
        "Open **Settings & Voice**, turn on **Mic input**, and click **Save**.",
        "Click the microphone next to the composer and allow microphone access if the browser asks.",
        "Speak, click the microphone again to stop, and review the text before pressing **Send**.",
    )),
    ("Saved memory", r"\b(?:memor(?:y|ies)|remember|forget|preferred name)\b", (
        "Sign in, then say **Call me Mike** or **Remember that I prefer short answers**.",
        "Ask **What do you remember about me?** or use **Settings & Voice → Review saved memory**.",
        "To remove an entry, say **Forget my preferred name** or **Forget that I prefer short answers**.",
    )),
    ("Sharing a file", r"\b(?:send|share|attach|upload)\w*\b.{0,28}\bfiles?\b|\bfile sharing\b", (
        "Sign in, open **Simo Messages**, and select the conversation.",
        "Click **Attach file**, choose a file, then click **Share file**.",
    )),
    ("Group messages", r"\b(?:group (?:chat|messag\w*|conversation)|create (?:a )?group)\b", (
        "Sign in and open **Simo Messages**.",
        "Open **New group conversation**, enter the recipient handles separated by commas, and add a group name.",
        "Click **Create group**, then send your first message.",
    )),
    ("Saved contacts", r"\b(?:saved? contacts?|contacts?|save (?:a |the |someone's )?handle)\b", (
        "Open a conversation in **Simo Messages** and click **Save contact**.",
        "Enter the name you want for that person and click **Save contact** again.",
    )),
    ("Audio and video calls", r"\b(?:calls?|calling|video call|audio call|webcam)\b", (
        "Sign in and open **Simo Audio / Video**. Save your Simo handle if prompted.",
        "Enter the other person’s Simo handle and choose **Audio call** or **Start video call**.",
        "Allow the browser to use your microphone and, for video, your camera. The recipient selects **Answer**.",
    )),
    ("Messages and handles", r"\b(?:simo connect|simo ids?|handles?|messages?|messaging|text someone)\b", (
        "Sign in, open **Simo Messages**, and save your Simo handle if prompted.",
        "Choose an existing conversation or use **New message** and enter the recipient’s Simo handle.",
        "Type your message and click **Send message**.",
    )),
    ("Website Builder Library", r"\bwebsite(?: builder)? library\b|\b(?:save|reopen|open)\b.{0,24}\b(?:saved )?websites?\b", (
        "Use **Save to Library** on the website result.",
        "Open **Website Builder Library** in the sidebar and choose your saved website.",
        "Select **Open Website Builder** to continue editing or **Open Full Preview** to view it.",
    )),
    ("Publishing a website", r"\bpublish\w*\b.{0,32}\b(?:website|site|landing page)\b|\bwebsite publish\w*\b", (
        "Open the website result and use **Open Full Preview** to check it.",
        "Click **Publish Website** and follow the publishing prompts.",
        "Open the resulting public link to check the published version.",
    )),
    ("Website Builder", r"\b(?:website builder|websites?|landing pages?)\b", (
        "Choose **Build a Website** in the sidebar. Describe the business, style, and sections you want, then send your prompt.",
        "On the result, choose **Open Website Builder**. Select an area and describe the change you want to apply.",
        "Use **Open Full Preview** to review the site and **Save to Library** to reopen it later.",
    )),
    ("Image analysis", r"\b(?:analy[sz]\w*|upload|read|interpret)\b.{0,30}\b(?:images?|photos?|screenshots?)\b|\bimage (?:upload|analysis)\b", (
        "Choose **Analyze an Image** or use the attachment button beside the composer.",
        "Attach or paste the image, then type what you want Simo to identify or explain.",
        "Click **Send** to submit your image and question together.",
    )),
    ("Design Library", r"\bdesign library\b|\bsave edited version\b", (
        "In the Design Workspace, use **Save Edited Version**.",
        "Open **Design Library** in the main sidebar, find the item, and choose **Open Workspace** to continue.",
    )),
    ("Design Workspace", r"\b(?:design(?: workspace| studio| something)?|(?:edit|generate|create) an? image|book covers?)\b", (
        "Choose **Design Something**. Describe what you want to design, including the subject and style.",
        "Open the result in the workspace and describe the change you want to make.",
        "Use **Save Edited Version** to keep the result in **Design Library**.",
    )),
    ("Video creation", r"\b(?:video|voiceover|narration|1080p|4k)\b", (
        "Open **Create Video** on the Simo home page. Use the Long Video option for a longer production.",
        "Describe the video and choose its length, framing, quality, and audio options.",
        "Review the quote before generating. Find finished results in the corresponding video library.",
    )),
    ("Business ideas and plans", r"\b(?:business (?:ideas?|plans?)|startups?)\b", (
        "Choose **Create a Business Idea** in the sidebar.",
        "Describe the problem, customer, starting budget or skills, and what you want Simo to help with.",
        "Ask Simo to develop the option you like into a plan or refine any part of it.",
    )),
    ("Accounts, plans, and credits", r"\b(?:sign[ -]?up|sign[ -]?in|log[ -]?in|subscription|credits?|billing|upgrade|auto.reload|team pro)\b", (
        "Use **Easy Signup** or **Sign in** to access your account.",
        "Open **Settings & Voice → Billing & Simo Credits** to see the options available to your account.",
        "Ask **Show me Simo’s pricing page** for the public plan comparison.",
    )),
    ("Chat", r"\b(?:just chat|new chat|clear history|composer)\b", (
        "Choose **Just Chat** or type a question in the composer and press **Send**.",
        "Use **New Chat** to start fresh. To manage saved account memory, ask **What do you remember about me?**",
    )),
)

_EXTERNAL_TOOL = re.compile(r"\b(?:in|on|with|using) (?:wordpress|wix|squarespace|shopify|canva|figma|photoshop|premiere(?: pro)?|capcut|zoom|teams|whatsapp|discord|github)\b")


def feature_help_reply(message):
    text = " ".join(str(message or "").lower().replace("’", "'").split())
    if not re.match(HELP_REQUEST_PATTERN, text) or _EXTERNAL_TOOL.search(text):
        return ""
    for title, topic, steps in _GUIDES:
        if re.search(topic, text):
            return f"**{title}**\n\n" + "\n".join(f"{index}. {step}" for index, step in enumerate(steps, 1))
    if re.search(r"\b(?:use|start(?:ed)? with|learn to use) (?:the )?simo(?: ai)?[?.!]*$", text):
        return (
            "**Getting started with Simo**\n\n"
            "1. Pick a sidebar mode such as **Build a Website**, **Design Something**, **Analyze an Image**, or **Just Chat**.\n"
            "2. Describe what you want in the composer and click **Send**.\n"
            "3. For a walkthrough, ask about a specific feature, such as **How do I publish a website?** or **How do I change the font?**"
        )
    return ""
