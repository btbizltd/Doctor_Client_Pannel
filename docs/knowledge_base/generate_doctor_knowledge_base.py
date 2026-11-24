"""Generates the customer-facing Knowledge Base (.docx) for the BtBiz Doctor (MediGraph) clinic platform.

Run:  python generate_doctor_knowledge_base.py
Output: BtBiz_Doctor_Knowledge_Base.docx (same folder)
"""

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

TITLE = "BtBiz Doctor (MediGraph)"
SUBTITLE = "Clinic Platform — Customer Knowledge Base"
VERSION = "1.0"
OUTPUT = Path(__file__).with_name("BtBiz_Doctor_Knowledge_Base.docx")

PRIMARY = RGBColor(0x0B, 0x5C, 0xAD)
DARK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x6B, 0x72, 0x80)


# ---------------------------------------------------------------- helpers

def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def add_rich(paragraph, text, size=None, color=None, mono=False):
    """Adds text where **segments** are bold."""
    for i, part in enumerate(text.split("**")):
        if not part:
            continue
        run = paragraph.add_run(part)
        run.bold = i % 2 == 1
        if size:
            run.font.size = Pt(size)
        if color:
            run.font.color.rgb = color
        if mono:
            run.font.name = "Consolas"
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
    return paragraph


def para(doc, text, style=None, space_after=6):
    p = doc.add_paragraph(style=style)
    add_rich(p, text)
    p.paragraph_format.space_after = Pt(space_after)
    return p


def bullets(doc, items):
    for item in items:
        p = para(doc, item, style="List Bullet", space_after=2)
        p.paragraph_format.left_indent = Cm(0.9)


def steps(doc, items):
    for n, item in enumerate(items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.9)
        p.paragraph_format.first_line_indent = Cm(-0.6)
        p.paragraph_format.space_after = Pt(3)
        run = p.add_run(f"{n}.  ")
        run.bold = True
        run.font.color.rgb = PRIMARY
        add_rich(p, item)


def table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        add_rich(cell.paragraphs[0], f"**{h}**", size=10, color=RGBColor(0xFF, 0xFF, 0xFF))
        shade(cell, "0B5CAD")
    for r_idx, row in enumerate(rows):
        cells = t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = ""
            add_rich(cells[i].paragraphs[0], value, size=10)
            if r_idx % 2 == 1:
                shade(cells[i], "EEF4FB")
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def callout(doc, label, text, fill="FFF7E6", label_color=RGBColor(0xB4, 0x53, 0x09)):
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    cell = t.rows[0].cells[0]
    shade(cell, fill)
    p = cell.paragraphs[0]
    run = p.add_run(f"{label}  ")
    run.bold = True
    run.font.color.rgb = label_color
    add_rich(p, text, size=10)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def tip(doc, text):
    callout(doc, "TIP", text, fill="ECFDF5", label_color=RGBColor(0x04, 0x78, 0x57))


def note(doc, text):
    callout(doc, "NOTE", text)


def faq(doc, items):
    for q, a in items:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(1)
        run = p.add_run("Q.  " + q)
        run.bold = True
        run.font.color.rgb = DARK
        p2 = doc.add_paragraph()
        p2.paragraph_format.left_indent = Cm(0.6)
        p2.paragraph_format.space_after = Pt(8)
        add_rich(p2, a)


def add_field(paragraph, instruction, placeholder=""):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(sep)
    paragraph.add_run(placeholder)
    end_run = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    end_run._r.append(end)


def setup_document():
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = DARK

    for level, size in ((1, 18), (2, 14), (3, 12)):
        style = doc.styles[f"Heading {level}"]
        style.font.name = "Calibri"
        style.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        style.font.size = Pt(size)
        style.font.color.rgb = PRIMARY
        style.font.bold = True

    update = OxmlElement("w:updateFields")
    update.set(qn("w:val"), "true")
    doc.settings.element.append(update)

    footer = doc.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(footer, f"{TITLE} — Knowledge Base  |  Page ", size=9, color=MUTED)
    add_field(footer, "PAGE", "1")
    return doc


def cover(doc):
    for _ in range(6):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(p, f"**{TITLE}**", size=28, color=PRIMARY)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(p, SUBTITLE, size=16, color=DARK)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(p, "Help guide for Patients, Doctors, Assistants, Labs and Pharmacies", size=12, color=MUTED)
    for _ in range(8):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(p, f"Version {VERSION}  |  {date.today().strftime('%d %B %Y')}", size=10, color=MUTED)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_rich(p, "WhatsApp Assistant: +91 96258 87227", size=10, color=MUTED)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    doc.add_heading("Contents", level=1)
    p = doc.add_paragraph()
    add_field(p, 'TOC \\o "1-2" \\h \\z \\u',
              "Right-click here and choose 'Update Field' to build the table of contents.")
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ---------------------------------------------------------------- content

def section_about(doc):
    doc.add_heading("1. About BtBiz Doctor", level=1)
    para(doc, "**BtBiz Doctor** (shown on the website as **MediGraph**) is a complete clinic platform that connects "
              "patients, doctors, front-desk assistants, labs and pharmacies in one system. Patients book "
              "appointments, request lab tests and order medicines online; the clinic team manages check-ins, "
              "vitals, documents, billing and doctor availability from their own dashboards.")
    doc.add_heading("Highlights", level=2)
    bullets(doc, [
        "**One mobile number = one family health account.** A single number can hold profiles for the whole family.",
        "**Online booking** with live daily slot limits, plus **walk-in** registration at the desk.",
        "**Doctor availability** (available / busy / unavailable with reason and duration) shared with the desk.",
        "**Lab tests and medicines** from the patient profile, with **home collection** and **home delivery** options.",
        "**Distance-aware:** labs and pharmacies sorted by distance; the desk can see how far a patient is from the clinic.",
        "**Secure documents:** clinic-uploaded files are verified by an assistant before the patient can open them.",
        "**Health trend graph** of vitals (BP, sugar, weight, temperature) on the patient profile.",
        "**WhatsApp Assistant** (+91 96258 87227) for booking and services directly on WhatsApp.",
    ])
    doc.add_heading("Who uses the platform", level=2)
    table(doc, ["Role", "How they sign in", "Main screen"], [
        ["Patient", "Mobile number + OTP (no password)", "My Health Profile"],
        ["Doctor", "Email + password (account approved by the platform team)", "Doctor Dashboard"],
        ["Assistant (front desk)", "Email + password (created by the doctor)", "Assistant Desk"],
        ["Lab Manager", "Email + password", "Lab Dashboard + Manage lab assistants"],
        ["Lab Assistant", "Email + password (created by the Lab Manager)", "Lab Dashboard"],
        ["Pharmacy", "Email + password", "Pharmacy Dashboard"],
    ], widths=[4, 7, 5.5])


def section_accounts(doc):
    doc.add_heading("2. Accounts & Signing In", level=1)

    doc.add_heading("Staff sign-in (Doctor, Assistant, Lab, Pharmacy)", level=2)
    steps(doc, [
        "Open the website and click **For staff only** (or go directly to the **Login** page).",
        "Under **Login as**, choose your role: **Doctor**, **Lab Manager**, **Assistant / Lab**, or **Pharmacy**.",
        "Enter your registered **email** and **password**.",
        "Click **Sign in**. You are taken to your role's dashboard.",
    ])
    note(doc, "Choose the correct role. If you pick the wrong one you will see "
              "*\"This is a/an {role} account. Please sign in using the {role} login.\"*")

    doc.add_heading("Creating accounts", level=2)
    table(doc, ["Account", "How it is created", "Activation"], [
        ["Doctor", "Self-registration on the **Register** page (name, email, WhatsApp number, password, optional public profile and photo).",
         "Needs **approval by the platform team** before first login."],
        ["Assistant", "Created by the doctor from the dashboard header → **Add assistant** (name, email, WhatsApp number, temporary password).",
         "Immediate"],
        ["Lab Manager / Lab", "Onboarded by the platform team, or self-registration on the Lab Manager register page.",
         "Immediate"],
        ["Lab Assistant", "Created by the Lab Manager → **Add lab assistant**.", "Immediate"],
        ["Pharmacy", "Onboarded by the platform team, or self-registration on the Pharmacy register page (name / shop name, email, mobile, password).",
         "Immediate"],
        ["Patient", "No sign-up form. A profile is created at the first online booking, or when the desk registers a walk-in.",
         "Immediate"],
    ], widths=[3.2, 8.8, 4.5])
    para(doc, "Phone numbers must be 10 digits (or 12 digits starting with 91). Each email and phone can be "
              "registered only once.")

    doc.add_heading("Forgot password (staff)", level=2)
    steps(doc, [
        "On the Login page click **Forgot Password?**",
        "Enter your **registered WhatsApp number** and click **Send OTP**.",
        "Enter the OTP and your **new password**, then submit.",
        "You will see *\"Password reset successful. You can now log in.\"* — sign in with the new password.",
    ])
    para(doc, "The OTP is valid for **10 minutes**.")

    doc.add_heading("Sessions & logging out", level=2)
    bullets(doc, [
        "For security, a session lasts about **1 hour**. After that a **Session expired** message appears — click "
        "**Login again**.",
        "Sessions are **per browser tab**. Closing the tab logs you out, and a new tab needs a fresh sign-in.",
        "You can be signed in with different roles in different tabs (useful for testing or shared desks).",
        "Use **Logout** in the header when you leave a shared computer.",
    ])


def section_patient(doc):
    doc.add_heading("3. Guide for Patients", level=1)

    doc.add_heading("3.1 Booking an appointment on the website", level=2)
    steps(doc, [
        "Click **Book appointment** on the website.",
        "Tick the box to accept the terms and location use, then click **Continue to book appointment**.",
        "Enter your **mobile number**, click **Send OTP**, enter the OTP and click **Verify & Load Family**.",
        "Choose the family member the appointment is for, or click **+ Add Family Member**.",
        "Choose **Consultation Type**: **New Consultation** or **Review Appointment**.",
        "Choose the **doctor** (grouped by department) and check the patient details and address.",
        "(Optional) Click **Use my location** to see your distance from the clinic.",
        "Pick the **appointment date** on the calendar. Coloured dots show how busy each day is "
        "(*Few*, *Filling up*, *Busy*). Past dates are disabled.",
        "Pick a **preferred time** (hourly slots). Check the **Slots** box to see how many online bookings are left.",
        "Click **Next**, choose a payment option, and confirm.",
        "Note your **Appointment ID** on the confirmation page. A confirmation is also sent to your WhatsApp number.",
    ])
    note(doc, "The preferred time is **approximate** — choosing 11:00 does not guarantee you will be called at 11:00. "
              "Please arrive **15 minutes early** and show your Appointment ID at the reception.")
    para(doc, "If online slots for a day are full, you will see *\"Today booking is closed…\"* — click **Find next "
              "available date**.")

    doc.add_heading("3.2 Family members", level=2)
    para(doc, "Family members are managed on the booking page after you verify your mobile number.")
    bullets(doc, [
        "**Add:** click **+ Add Family Member** and fill in full name, relation (Self, Spouse, Son, Daughter, "
        "Father, Mother, Brother, Sister, Other), gender, date of birth and address.",
        "**Edit / Delete:** use the **Edit** or **Delete** button next to a member.",
        "**View records:** opens that member's health profile.",
        "The **Self** profile must be **18 years or older**. Children can be added as family members — a "
        "parent or guardian manages their profile.",
    ])

    doc.add_heading("3.3 Logging in to My Health Profile", level=2)
    steps(doc, [
        "Click **Patient login** (or **My Profile Login**).",
        "Enter your registered mobile number and request the OTP.",
        "Enter the **6-digit OTP** (valid for 10 minutes).",
        "If several family members share the number, choose whose profile to open.",
    ])
    para(doc, "If you see *\"No profile found for this mobile\"*, book an appointment first — that creates your profile.")

    doc.add_heading("3.4 What's on My Health Profile", level=2)
    table(doc, ["Section", "What you can do"], [
        ["My Details", "See your name, mobile, gender, date of birth, blood group and address."],
        ["Appointments", "See your visits with date, doctor, reason and notes."],
        ["Health Trend Graph", "See your fasting sugar, blood pressure, weight and temperature over time "
                               "(needs at least 2 visit readings)."],
        ["Lab Tests", "Request lab tests and track their status, payment, receipt and report."],
        ["Medicine Requests", "Order medicines from a pharmacy and track status and bills."],
        ["Pharmacy (Dispensed)", "See bills for medicines given by the clinic pharmacy."],
        ["My Reports & Documents", "Upload your own reports/prescriptions and open documents released by the clinic."],
    ], widths=[4.5, 12])

    doc.add_heading("3.5 Requesting a lab test", level=2)
    steps(doc, [
        "In **Lab Tests**, choose a lab. Labs are **sorted by distance** (use the location button for best results).",
        "Optionally pick suggested tests from your last verified prescription.",
        "Type test names and click **+ Add to list** (you can paste several names separated by commas).",
        "Choose **Lab visit** or **Home service**, the payment option, and your preferred date & time.",
        "Click **Request** to send the request to the lab.",
    ])
    table(doc, ["Status shown", "Meaning"], [
        ["Waiting for lab", "Request sent; the lab has not accepted it yet."],
        ["Accepted by lab", "The lab has accepted your request. For home service, a representative will call you."],
        ["Ready", "The test is done / the report is ready."],
        ["Cancelled", "The request was cancelled by the lab."],
    ], widths=[4.5, 12])
    para(doc, "Once payment is marked **Paid**, you can open the **receipt** and the **report**. Reports open only "
              "after payment is complete.")

    doc.add_heading("3.6 Ordering medicines", level=2)
    steps(doc, [
        "In **Medicine Requests**, choose a pharmacy (sorted by distance).",
        "Enter the medicine name, dosage and any notes (or pick suggestions from your last verified prescription).",
        "Choose **Pickup from medical** or **Home delivery** (home delivery requires online payment).",
        "Submit the request.",
    ])
    table(doc, ["Status shown", "Meaning"], [
        ["Waiting for pharmacy", "Request sent; not yet accepted."],
        ["Accepted by chemist", "The pharmacy is preparing your order."],
        ["Ready", "Your order is ready for pickup / delivery."],
        ["Cancelled", "The order was cancelled by the pharmacy."],
    ], widths=[4.5, 12])
    para(doc, "If a medicine is unavailable, the pharmacy may give a substitute — you will see "
              "*\"This tablet is substitute: …\"* on the order. Paid orders have a **View bill / receipt** button.")

    doc.add_heading("3.7 Your documents", level=2)
    bullets(doc, [
        "Click **+ Add Document** to upload a photo or PDF. Your doctor and the clinic assistant can see uploaded files.",
        "Files uploaded **by the clinic** are checked by the assistant first. Until then you will see "
        "*\"Assistant verification in progress — you can open this after your clinic releases it.\"*",
        "Document links are temporary for your security; simply open the document again from your profile to get a fresh link.",
    ])

    doc.add_heading("3.8 Changing or cancelling an appointment", level=2)
    para(doc, "Online cancellation and rescheduling are not available at the moment. Please contact the clinic "
              "reception to change or cancel an appointment.")


def section_doctor(doc):
    doc.add_heading("4. Guide for Doctors", level=1)

    doc.add_heading("4.1 Doctor Dashboard overview", level=2)
    table(doc, ["Area", "What it shows / does"], [
        ["Summary cards", "Today's appointments, number of assistants, upcoming appointments, new notifications."],
        ["Today / Upcoming", "Appointment lists with booking source (e.g. WhatsApp), payment status, preferred "
                             "slot and patient distance. Click a patient to open their details."],
        ["Your availability", "Mark yourself Available, Busy or Unavailable (with reason and duration)."],
        ["New patient notifications", "Patients referred to you by the assistant after check-in."],
        ["Daily caps", "Separate daily limits for online bookings and walk-ins."],
        ["Public profile", "Your profile shown on the website and the WhatsApp Assistant."],
    ], widths=[4.5, 12])
    note(doc, "Patients who have been checked in by the assistant move off the Today / Upcoming lists and arrive "
              "as a **referral notification**. Refresh the page to see new online bookings in the lists.")

    doc.add_heading("4.2 Setting your availability", level=2)
    steps(doc, [
        "In **Your availability**, choose **Available**, **Busy** or **Unavailable**.",
        "For Unavailable, enter an optional reason (e.g. *In surgery, back in 3 hours*) and a duration "
        "(30 min, 1 h, 2 h, 3 h, 4 h or Custom).",
        "Click **Save reason & time period**.",
    ])
    para(doc, "Your status is shared instantly with the assistant desk. While you are **Unavailable**, patients "
              "cannot book online slots for that period (until the chosen end time, or the rest of the day if no "
              "end time is set).")

    doc.add_heading("4.3 Daily online and walk-in limits", level=2)
    para(doc, "Under **Daily caps (IST)**, set **Online / day** and **Walk-in / day** separately — for example 20 "
              "online + 20 walk-in. Leave a box blank for no limit, then save. When a limit is reached, online "
              "booking (or desk walk-in registration) for that day is closed automatically.")

    doc.add_heading("4.4 Patient referrals from the desk", level=2)
    para(doc, "When the assistant checks a patient in and clicks **Refer to doctor**, you get a live pop-up — "
              "*\"Next patient — {name} is here. Open details?\"* — and an entry in **New patient notifications**. "
              "Click **Open details** to see the patient's vitals, history and documents.")

    doc.add_heading("4.5 Searching for a patient", level=2)
    steps(doc, [
        "Open **Search patients**.",
        "Enter the patient's 10-digit mobile number.",
        "If several family members share the number, choose the right profile.",
    ])
    para(doc, "The patient page shows: patient info, **visit history** with vitals, prescriptions and documents, "
              "medicines, pharmacy dispensed items and **diagnostic tests** (with *View report* when available).")

    doc.add_heading("4.6 Your public profile", level=2)
    para(doc, "Fill in department, specialization, qualification, previous hospital, years of experience and a short "
              "bio, and upload a photo (**JPG, PNG or WEBP, max 2 MB**). After saving, your profile appears on the "
              "website's **Doctors** page and in the WhatsApp Assistant.")

    doc.add_heading("4.7 Adding an assistant", level=2)
    para(doc, "Click **Add assistant** in the header, enter the assistant's full name, email, WhatsApp number and a "
              "temporary password, and save. Share the email and temporary password with the assistant so they can "
              "sign in using **Assistant / Lab** login.")


def section_assistant(doc):
    doc.add_heading("5. Guide for Assistants (Front Desk)", level=1)

    doc.add_heading("5.1 Assistant Desk overview", level=2)
    table(doc, ["Area", "Purpose"], [
        ["Prescriptions waiting for release", "Queue of clinic-uploaded files to verify and release to patients."],
        ["Doctor availability", "Live status of every doctor; update a doctor's status after checking with them."],
        ["Today's appointments", "All doctors' appointments for today, with patient distance from the clinic."],
        ["Today checked-in patients", "Audit list of patients already checked in today."],
        ["Upcoming appointments", "Future bookings for all doctors."],
        ["Find or register patient", "Search by mobile, or register a walk-in patient."],
    ], widths=[5.5, 11])
    para(doc, "Appointment lists refresh automatically every 30 seconds.")

    doc.add_heading("5.2 Checking in a patient (booked or walk-in)", level=2)
    steps(doc, [
        "Under **Find or register patient**, enter the patient's mobile number (or open them from today's list).",
        "If the patient is not found, the **Register patient** form opens. Fill in first name, mobile and other "
        "details (address, reason, health history, blood group, emergency contact), then click "
        "**Register & continue to vitals**.",
        "Record the **vitals**: BP systolic and diastolic (**required**), fasting sugar, weight, temperature, other "
        "tests and notes for the doctor.",
        "(Optional) **Upload report / document** (PDF, JPG, PNG) and click **Upload to patient record**.",
        "Booked patients are referred to their booked doctor; for walk-ins choose the doctor under "
        "**Walk-in: refer to doctor**.",
        "Click **Refer to doctor**. The doctor receives a live notification.",
    ])
    note(doc, "Opening a patient from today's list marks today's visit as checked in.")

    doc.add_heading("5.3 Verifying and releasing documents", level=2)
    steps(doc, [
        "In **Prescriptions waiting for release**, click **Open verify** on a file.",
        "Check the file preview. Medicines, tests and notes may be pre-filled automatically from the document — "
        "review and correct them.",
        "Make sure at least one medicine, lab test or note is entered.",
        "Save. The document is **released**: the patient can now open it, and the lab/pharmacy see your verified "
        "list in their secure preview.",
    ])

    doc.add_heading("5.4 Updating doctor availability", level=2)
    para(doc, "Under **Doctor availability**, choose the doctor in **Update status for**, set Available / Busy / "
              "Unavailable with reason and duration, and click **Save reason & duration**. The change is pushed live "
              "to the doctor and all assistants.")
    para(doc, "When a doctor is busy or unavailable, the panel lists patients **within 500 metres** of the clinic "
              "with tap-to-call numbers, so you can inform them personally and check them in.")

    doc.add_heading("5.5 Understanding patient distance", level=2)
    table(doc, ["Label", "Meaning"], [
        ["Within 500m (arrived)", "The patient is at or very near the clinic."],
        ["~x km from clinic", "Approximate distance based on the location shared while booking."],
        ["Location not shared yet", "The patient did not share a location."],
        ["Clinic location not set", "The clinic's map location is missing — contact support to set it."],
    ], widths=[5.5, 11])


def section_lab(doc):
    doc.add_heading("6. Guide for Labs", level=1)

    doc.add_heading("6.1 Handling incoming test requests", level=2)
    para(doc, "**Incoming test requests** are grouped as Today / Tomorrow / Yesterday / Older and refresh every 10 "
              "seconds. Each request has four actions:")
    table(doc, ["Button", "What it does"], [
        ["Accept", "Accepts the request, opens the patient and adds the tests to a lab visit."],
        ["Cancel", "Cancels the request (asks for confirmation)."],
        ["Ready", "Marks the request completed."],
        ["Mark paid", "Records payment and generates a receipt (LAB-…)."],
    ], widths=[4, 12.5])

    doc.add_heading("6.2 Lab workspace — rates, reports and payment", level=2)
    steps(doc, [
        "Search the patient by 10-digit mobile number and choose the visit.",
        "Add tests if needed (**Add test** — CBC, HbA1c, Lipid Profile, Thyroid (TSH), LFT, KFT, Blood Sugar "
        "Fasting, Urine Routine, X-Ray, ECG, Ultrasound or Other).",
        "Enter the **rate (₹)** for each test and **upload the report** (PDF, JPG, PNG).",
        "Click **Save rates**.",
        "Click **Mark paid**. The receipt can be printed or saved as PDF.",
    ])
    note(doc, "**Mark paid** works only when **every test has a rate above ₹0 and an uploaded report**. "
              "The patient can open the report only after payment is marked.")
    para(doc, "When a report is uploaded, the patient is notified on WhatsApp (and by email, if available) with a "
              "secure download link.")

    doc.add_heading("6.3 Lab Manager: managing lab assistants", level=2)
    para(doc, "Lab Managers can open **Manage lab assistants** to add a lab assistant (full name, email, WhatsApp "
              "number, password) or delete one, and use **Open lab workspace** to work on requests.")


def section_pharmacy(doc):
    doc.add_heading("7. Guide for Pharmacies", level=1)

    doc.add_heading("7.1 Handling incoming medicine requests", level=2)
    table(doc, ["Button", "What it does"], [
        ["Accept", "Accepts the order; the bill rows are pre-filled with the requested medicines."],
        ["Cancel", "Cancels the order."],
        ["Ready", "Tells the patient the order is ready."],
        ["Mark paid", "Marks the order as paid."],
        ["Mark substitute", "Records a substitute medicine name and note; the patient sees it on the order."],
    ], widths=[4, 12.5])
    para(doc, "Requests are grouped as Today / Yesterday / Older and refresh every 10 seconds.")

    doc.add_heading("7.2 Billing and receipts", level=2)
    steps(doc, [
        "Search the patient by mobile number.",
        "Under **Add medicines**, add rows with name, **MRP** (required, above ₹0), discount and quantity, then save the bill.",
        "Under **Payment & receipt**, enter the amount received (leave blank for the full amount).",
        "Click **Mark as paid**. A receipt (RCP-…) is created and can be printed or saved as PDF.",
    ])
    para(doc, "Line amount = MRP × quantity − discount. Partial payments are supported. If the bill came from a "
              "patient request, that request is automatically marked paid and completed.")

    doc.add_heading("7.3 Secure prescription preview", level=2)
    para(doc, "Pharmacies (and labs) see prescriptions in a **secure, view-only preview**: pharmacies see "
              "medicines only, labs see tests only. Download is disabled and the preview link expires after "
              "**15 minutes**. Files verified by the clinic assistant show **Verified by assistant**.")


def section_documents_security(doc):
    doc.add_heading("8. Documents, Privacy & Security", level=1)
    table(doc, ["Topic", "How it works"], [
        ["Patient uploads", "Visible to the patient, doctor and assistant immediately."],
        ["Clinic uploads", "Stay hidden from the patient until the assistant verifies and releases them."],
        ["Lab reports", "Open for the patient only after the lab marks payment as paid."],
        ["Lab / pharmacy access", "Secure view-only preview, limited to the relevant items, valid for 15 minutes."],
        ["Patient / staff file links", "Temporary links (valid up to 24 hours)."],
        ["WhatsApp report links", "Valid for 10 minutes — open the report again from the profile for a new link."],
        ["Accepted file types", "Images (JPG, PNG) and PDF. Doctor photo: JPG, PNG or WEBP up to 2 MB."],
        ["Sessions", "About 1 hour per sign-in, per browser tab."],
    ], widths=[4.5, 12])
    bullets(doc, [
        "Never share your password or OTP with anyone — clinic staff will never ask for your OTP.",
        "Log out on shared computers.",
        "The platform is **not for emergencies**. In a medical emergency, call **112** or go to the nearest hospital.",
    ])


def section_notifications(doc):
    doc.add_heading("9. Notifications", level=1)
    table(doc, ["Event", "Who is notified", "How"], [
        ["Online appointment booked", "Patient", "WhatsApp confirmation with Appointment ID"],
        ["OTP for login / booking / password reset", "Patient or staff", "WhatsApp"],
        ["Lab report uploaded", "Patient", "WhatsApp link (and email with attachment, if available)"],
        ["Lab payment received / medicine ready", "Patient", "Message on the profile page when it is opened"],
        ["Patient referred by assistant", "Doctor", "Live pop-up + notification list"],
        ["Doctor availability changed", "Doctor and all assistants", "Live update on dashboards"],
        ["New lab / medicine request", "Lab / Pharmacy", "Appears in Incoming requests (auto-refresh)"],
    ], widths=[5.5, 4.5, 6.5])


def section_payments(doc):
    doc.add_heading("10. Payments & Receipts", level=1)
    bullets(doc, [
        "**Consultation fee:** ₹500. At booking, choose to pay online or **pay cash at the clinic**.",
        "**Review appointments** may be **free** if eligible (shown as *Free review*, ₹0).",
        "**Lab tests:** pay at the lab, online, or cash on home service. The lab marks payment as paid.",
        "**Medicines:** pickup orders can be paid at the pharmacy; home delivery requires online payment.",
    ])
    table(doc, ["Receipt number starts with", "Used for"], [
        ["LAB-", "Lab test payment receipt"],
        ["MED-", "Medicine order receipt"],
        ["RCP-", "Pharmacy (walk-in) bill receipt"],
    ], widths=[6, 10.5])
    tip(doc, "Receipts open in a new browser window with **Print / save as PDF**. If nothing opens, allow pop-ups "
             "for the website in your browser.")


def section_whatsapp(doc):
    doc.add_heading("11. WhatsApp Assistant", level=1)
    para(doc, "Patients can also use the **MediGraph HealthCare Assistant** on WhatsApp at **+91 96258 87227**. "
              "Send **hi** to get 7 services: Book Appointment, My Profile & History, My Family Members, Request Lab "
              "Test, Order Medicines, Upload Prescription, and Receipts & Reports. Bookings and requests made on "
              "WhatsApp go to the same clinic system and appear on the same dashboards.")
    para(doc, "See the separate **MediGraph HealthCare Assistant — Knowledge Base** for full bot instructions.")


def section_faqs(doc):
    doc.add_heading("12. Frequently Asked Questions", level=1)
    doc.add_heading("Patients", level=2)
    faq(doc, [
        ("Do I need a password?",
         "No. Patients sign in with their mobile number and a one-time password (OTP)."),
        ("Can I book for my parents or children with my number?",
         "Yes. Add them as family members and select them while booking."),
        ("I can't log in — it says no profile found.",
         "Book an appointment first; this creates your profile. Or ask the clinic desk to register you."),
        ("How do I cancel or reschedule?",
         "Please contact the clinic reception. Online cancellation is not available yet."),
        ("Why can't I open my lab report?",
         "Reports open after the lab marks payment as paid. If it is already paid, ask the lab to re-upload the report."),
        ("Why does a document say 'Assistant verification in progress'?",
         "Clinic-uploaded files are checked by the assistant first. You can open it after it is released."),
        ("Why isn't my health graph showing?",
         "The graph needs at least two visits with recorded vitals."),
        ("Why does a lab or pharmacy show 'distance not available'?",
         "That provider's map location is not set yet. You can still choose it."),
    ])
    doc.add_heading("Doctors & assistants", level=2)
    faq(doc, [
        ("I registered but can't log in.",
         "New doctor accounts need approval by the platform team. You will see "
         "*\"Your account is pending super admin approval\"* until then."),
        ("How do I stop online bookings for today?",
         "Mark yourself **Unavailable** (with duration), or set **Online / day** to the number already booked."),
        ("A walk-in can't be registered — 'Walk-in slots are full'.",
         "The doctor's daily walk-in limit is reached. The doctor can raise the limit under **Daily caps**."),
        ("I don't see a new online booking on my dashboard.",
         "Refresh the page. Lists load when the page opens; referrals from the desk arrive live."),
        ("Why can't I save vitals?",
         "Blood pressure (systolic and diastolic) is required."),
        ("How do I reset an assistant's password?",
         "The assistant can use **Forgot Password?** with their registered WhatsApp number."),
    ])
    doc.add_heading("Labs & pharmacies", level=2)
    faq(doc, [
        ("'Mark paid blocked' — what does it mean?",
         "Every test needs a saved rate above ₹0 and an uploaded report before it can be marked paid."),
        ("Can I download the patient's prescription?",
         "No. For privacy, prescriptions open in a view-only secure preview that expires after 15 minutes."),
        ("How do I offer a substitute medicine?",
         "On the incoming request, enter the substitute name and note, then click **Mark substitute**."),
        ("Can I give a discount?",
         "Yes. Enter the discount on each medicine row while billing."),
    ])


def section_troubleshooting(doc):
    doc.add_heading("13. Troubleshooting — Common Messages", level=1)
    table(doc, ["Message", "Meaning", "What to do"], [
        ["Invalid email or password", "Wrong login details.", "Check spelling, or use **Forgot Password?**"],
        ["This is a/an {role} account…", "Wrong role selected.", "Select the role shown in the message."],
        ["Your account is pending super admin approval", "Doctor account not yet approved.", "Wait for approval or contact support."],
        ["Session expired", "You were signed in for over an hour, or the tab was idle.", "Click **Login again**."],
        ["Invalid or expired OTP", "Wrong OTP, or more than 10 minutes passed.", "Request a new OTP."],
        ["No profile found for this mobile", "No patient profile on that number.", "Book an appointment first, or register at the desk."],
        ["Online booking slots … are full", "The doctor's daily online limit is reached.", "Choose another date."],
        ["Selected day is full", "No more bookings on that date.", "Choose another date."],
        ["Payment required to access report", "Lab payment not yet marked paid.", "Complete payment with the lab."],
        ["Document file is not available on server", "The file is missing.", "Ask the clinic to re-upload it."],
        ["Popup blocked", "The browser blocked the receipt window.", "Allow pop-ups for the website."],
        ["Location is not supported by your browser", "The browser can't share location.", "Use a modern browser, or skip location."],
        ["A patient with this mobile number already exists", "The patient is already registered.", "Search by mobile instead of registering again."],
    ], widths=[5.5, 5.3, 5.7])


def section_glossary(doc):
    doc.add_heading("14. Glossary", level=1)
    table(doc, ["Term", "Meaning"], [
        ["Appointment ID / Booking ID", "Reference for a booking (e.g. MG-XXXXXX). Show it at the reception."],
        ["Walk-in", "A patient registered at the clinic desk without an online booking."],
        ["Daily caps", "The doctor's maximum online and walk-in patients per day."],
        ["Check-in", "The assistant records the patient's arrival and vitals."],
        ["Refer to doctor", "The assistant sends a checked-in patient to the doctor's queue."],
        ["Release", "The assistant approves a clinic-uploaded document so the patient can open it."],
        ["Secure preview", "A view-only, time-limited view of a prescription for labs and pharmacies."],
        ["Substitute", "An alternative medicine given when the requested one is unavailable."],
        ["Home service / Home delivery", "Lab sample collection at home / medicines delivered to your home."],
        ["Review appointment", "A follow-up visit with the same doctor; may be free if eligible."],
        ["OTP", "One-Time Password sent to your WhatsApp number."],
    ], widths=[5, 11.5])


def section_help(doc):
    doc.add_heading("15. Need More Help?", level=1)
    bullets(doc, [
        "**Patients:** contact your clinic reception, or use the WhatsApp Assistant at **+91 96258 87227**.",
        "**Clinic staff, labs and pharmacies:** contact the BtBiz Doctor platform support team for account approval, "
        "onboarding, clinic location setup or technical issues.",
        "In a medical emergency, call **112** or go to the nearest hospital immediately.",
    ])


def main():
    doc = setup_document()
    cover(doc)
    for section in (section_about, section_accounts, section_patient, section_doctor, section_assistant,
                    section_lab, section_pharmacy, section_documents_security, section_notifications,
                    section_payments, section_whatsapp, section_faqs, section_troubleshooting,
                    section_glossary, section_help):
        section(doc)
    doc.save(OUTPUT)
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    main()
